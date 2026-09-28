import { randomUUID } from "crypto";

const baseUrl = process.env.ERP_TEST_API_URL ?? "http://localhost:3000/api";
const email = process.env.ERP_TEST_EMAIL;
const password = process.env.ERP_TEST_PASSWORD;

if (!email || !password) {
  throw new Error("Defina ERP_TEST_EMAIL y ERP_TEST_PASSWORD antes de ejecutar la verificación de roles.");
}
const testEmail = email;
const testPassword = password;

async function request(path: string, init: RequestInit = {}) {
  return fetch(baseUrl + path, init);
}

async function expectStatus(name: string, response: Response, expected: number) {
  if (response.status !== expected) {
    throw new Error(`${name}: se esperaba HTTP ${expected}, se recibió ${response.status}. ${await response.text()}`);
  }
  console.log(`OK ${name}`);
}

async function login(loginEmail: string, loginPassword: string) {
  return request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: loginEmail, password: loginPassword }),
  });
}

async function main() {
  const adminLogin = await login(testEmail, testPassword);
  await expectStatus("Inicio de sesión administrador", adminLogin, 200);
  const adminToken = ((await adminLogin.json()) as { data: { accessToken: string } }).data.accessToken;
  const adminHeaders = { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" };

  const [rolesResponse, permissionsResponse, companiesResponse, geographyResponse, countriesResponse] = await Promise.all([
    request("/roles", { headers: adminHeaders }),
    request("/permissions", { headers: adminHeaders }),
    request("/companies", { headers: adminHeaders }),
    request("/catalogs/geography", { headers: adminHeaders }),
    request("/catalogs/countries", { headers: adminHeaders }),
  ]);
  await Promise.all([
    expectStatus("Consultar roles", rolesResponse, 200),
    expectStatus("Consultar permisos", permissionsResponse, 200),
    expectStatus("Consultar empresas", companiesResponse, 200),
    expectStatus("Consultar geografía", geographyResponse, 200),
    expectStatus("Consultar países", countriesResponse, 200),
  ]);

  const roles = ((await rolesResponse.json()) as { data: Array<{ id: number; isSystem: boolean }> }).data;
  const permissions = ((await permissionsResponse.json()) as { data: Array<{ id: number; action: string; isActive: boolean }> }).data;
  const companies = ((await companiesResponse.json()) as { data: Array<{ id: number; isActive: boolean }> }).data;
  const departments = ((await geographyResponse.json()) as { data: { departments: Array<{ id: number; municipalities: Array<{ id: number; districts: Array<{ id: number }> }> }> } }).data.departments;
  const countries = ((await countriesResponse.json()) as { data: Array<{ id: number; isoCode: string }> }).data;
  const roleViewPermission = permissions.find((permission) => permission.action === "roles.view" && permission.isActive);
  const secondPermission = permissions.find((permission) => permission.isActive && permission.id !== roleViewPermission?.id);
  const companyId = companies.find((company) => company.isActive)?.id;
  const countryId = countries.find((country) => country.isoCode === "SV")?.id;
  const department = departments[0];
  const municipality = department?.municipalities[0];
  const district = municipality?.districts[0];
  const systemRole = roles.find((role) => role.isSystem);
  if (!roleViewPermission || !secondPermission || !companyId || !countryId || !department || !municipality || !district || !systemRole) {
    throw new Error("No hay catálogos suficientes para verificar el módulo de roles.");
  }

  const suffix = randomUUID().slice(0, 8);
  const roleName = `qa.role.${suffix}`;
  const rolePayload = { name: roleName, description: "Rol temporal de verificación", permissionIds: [roleViewPermission.id] };
  const userEmail = `roles.${suffix}@erp.local`;
  const userPassword = "Lumen#2026Role";
  let roleId: number | undefined;
  let userId: number | undefined;

  try {
    const createdRole = await request("/roles", { method: "POST", headers: adminHeaders, body: JSON.stringify(rolePayload) });
    await expectStatus("Crear rol y permisos en una sola operación", createdRole, 201);
    roleId = ((await createdRole.json()) as { data: { id: number } }).data.id;

    const detailedRole = await request(`/roles/${roleId}`, { headers: adminHeaders });
    await expectStatus("Consultar permisos y módulo del rol", detailedRole, 200);
    const roleDetail = ((await detailedRole.json()) as { data: { permissions: Array<{ id: number; module?: { id: number; name: string } }> } }).data;
    if (!roleDetail.permissions.some((permission) => permission.id === roleViewPermission.id && permission.module?.name)) {
      throw new Error("El detalle del rol no incluye el módulo de cada permiso.");
    }
    console.log("OK Agrupar permisos por módulo");

    await expectStatus(
      "Rechazar nombre de rol duplicado sin distinguir mayúsculas",
      await request("/roles", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ ...rolePayload, name: roleName.toUpperCase() }),
      }),
      409,
    );
    await expectStatus(
      "Proteger la duplicación de roles del sistema",
      await request(`/roles/${systemRole.id}/duplicate`, { method: "POST", headers: adminHeaders, body: "{}" }),
      403,
    );

    const createdUser = await request("/users", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        username: `roles.${suffix}`,
        email: userEmail,
        password: userPassword,
        employeeCode: `ROL-${suffix}`,
        employeeName: "Usuario QA Roles",
        countryId,
        departmentId: department.id,
        municipalityId: municipality.id,
        districtId: district.id,
        roleIds: [roleId],
        companyIds: [companyId],
      }),
    });
    await expectStatus("Crear usuario con rol temporal", createdUser, 201);
    userId = ((await createdUser.json()) as { data: { id: number } }).data.id;

    const firstUserLogin = await login(userEmail, userPassword);
    await expectStatus("Iniciar sesión con permisos del rol", firstUserLogin, 200);
    const firstAccessToken = ((await firstUserLogin.json()) as { data: { accessToken: string } }).data.accessToken;

    const updatedRole = await request(`/roles/${roleId}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({
        name: roleName,
        description: "Rol temporal actualizado",
        permissionIds: [roleViewPermission.id, secondPermission.id],
      }),
    });
    await expectStatus("Actualizar rol y permisos de forma atómica", updatedRole, 200);
    await expectStatus(
      "Invalidar sesión al cambiar permisos del rol",
      await request("/auth/me", { headers: { Authorization: `Bearer ${firstAccessToken}` } }),
      401,
    );

    const secondUserLogin = await login(userEmail, userPassword);
    await expectStatus("Iniciar sesión con permisos actualizados", secondUserLogin, 200);
    const secondAccessToken = ((await secondUserLogin.json()) as { data: { accessToken: string } }).data.accessToken;
    await expectStatus(
      "Aplicar permiso actualizado al usuario",
      await request("/roles", { headers: { Authorization: `Bearer ${secondAccessToken}` } }),
      200,
    );

    const deactivation = await request(`/roles/${roleId}/status`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    await expectStatus("Desactivar rol", deactivation, 200);
    await expectStatus(
      "Invalidar sesión al desactivar rol",
      await request("/auth/me", { headers: { Authorization: `Bearer ${secondAccessToken}` } }),
      401,
    );
    await expectStatus(
      "Reactivar rol",
      await request(`/roles/${roleId}/status`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ isActive: true }) }),
      200,
    );
  } finally {
    if (userId) {
      await expectStatus("Limpiar usuario temporal", await request(`/users/${userId}`, { method: "DELETE", headers: adminHeaders }), 200);
    }
    if (roleId) {
      await expectStatus("Eliminar rol temporal", await request(`/roles/${roleId}`, { method: "DELETE", headers: adminHeaders }), 200);
      await expectStatus(
        "Restaurar nombre de rol eliminado",
        await request("/roles", { method: "POST", headers: adminHeaders, body: JSON.stringify(rolePayload) }),
        201,
      );
      const restored = await request("/roles?search=" + encodeURIComponent(roleName), { headers: adminHeaders });
      await expectStatus("Consultar rol restaurado", restored, 200);
      const restoredRole = ((await restored.json()) as { data: Array<{ id: number }> }).data[0];
      if (restoredRole) {
        await expectStatus("Limpiar rol restaurado", await request(`/roles/${restoredRole.id}`, { method: "DELETE", headers: adminHeaders }), 200);
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
