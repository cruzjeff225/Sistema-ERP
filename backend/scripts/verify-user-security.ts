import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const baseUrl = process.env.ERP_TEST_API_URL ?? "http://localhost:3000/api";
const email = process.env.ERP_TEST_EMAIL;
const password = process.env.ERP_TEST_PASSWORD;

if (!email || !password) {
  throw new Error("Defina ERP_TEST_EMAIL y ERP_TEST_PASSWORD antes de ejecutar la verificación de usuarios.");
}
const testEmail = email;
const testPassword = password;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function request(path: string, init: RequestInit = {}) {
  return fetch(baseUrl + path, init);
}

async function expectStatus(name: string, response: Response, expected: number) {
  if (response.status !== expected) {
    throw new Error(name + ": se esperaba HTTP " + expected + ", se recibió " + response.status + ". " + await response.text());
  }
  console.log("OK " + name);
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
  await expectStatus("Inicio de sesión de administrador", adminLogin, 200);
  const adminToken = ((await adminLogin.json()) as { data: { accessToken: string } }).data.accessToken;
  const adminHeaders = { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" };

  const [rolesResponse, companiesResponse, geographyResponse, countriesResponse] = await Promise.all([
    request("/roles", { headers: adminHeaders }),
    request("/companies", { headers: adminHeaders }),
    request("/catalogs/geography", { headers: adminHeaders }),
    request("/catalogs/countries", { headers: adminHeaders }),
  ]);
  await Promise.all([
    expectStatus("Consultar roles", rolesResponse, 200),
    expectStatus("Consultar empresas", companiesResponse, 200),
    expectStatus("Consultar geografía", geographyResponse, 200),
    expectStatus("Consultar países", countriesResponse, 200),
  ]);

  const roles = ((await rolesResponse.json()) as { data: Array<{ id: number; isActive: boolean }> }).data;
  const companies = ((await companiesResponse.json()) as { data: Array<{ id: number; isActive: boolean }> }).data;
  const departments = ((await geographyResponse.json()) as { data: { departments: Array<{ id: number; municipalities: Array<{ id: number; districts: Array<{ id: number }> }> }> } }).data.departments;
  const countries = ((await countriesResponse.json()) as { data: Array<{ id: number; isoCode: string }> }).data;
  const roleId = roles.find((role) => role.isActive)?.id;
  const companyId = companies.find((company) => company.isActive)?.id;
  const department = departments[0];
  const municipality = department?.municipalities[0];
  const district = municipality?.districts[0];
  const countryId = countries.find((country) => country.isoCode === "SV")?.id;
  if (!roleId || !companyId || !countryId || !department || !municipality || !district) {
    throw new Error("No hay catálogos activos suficientes para verificar usuarios.");
  }

  const suffix = randomUUID().slice(0, 8);
  const username = "security." + suffix;
  const userEmail = "security." + suffix + "@erp.local";
  const initialPassword = "Nexus#2026Secure";
  const updatedPassword = "Lumen$2027Strong";
  const unlockedPassword = "Vega!2028Secure";
  const payload = {
    username,
    email: userEmail,
    password: initialPassword,
    employeeCode: "SEC-" + suffix,
    employeeName: "Usuario Seguridad QA",
    countryId,
    departmentId: department.id,
    municipalityId: municipality.id,
    districtId: district.id,
    roleIds: [roleId],
    companyIds: [companyId],
  };

  let userId: number | undefined;
  try {
    const weakPassword = await request("/users", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ ...payload, username: "weak." + suffix, email: "weak." + suffix + "@erp.local", employeeCode: "WEAK-" + suffix, password: "short" }),
    });
    await expectStatus("Rechazar contraseña débil", weakPassword, 400);

    const creation = await request("/users", { method: "POST", headers: adminHeaders, body: JSON.stringify(payload) });
    await expectStatus("Crear usuario seguro", creation, 201);
    userId = ((await creation.json()) as { data: { id: number } }).data.id;

    const firstLogin = await login(userEmail, initialPassword);
    await expectStatus("Iniciar sesión con contraseña inicial", firstLogin, 200);
    const firstAccessToken = ((await firstLogin.json()) as { data: { accessToken: string } }).data.accessToken;

    const passwordReset = await request("/users/" + userId + "/password", {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ newPassword: updatedPassword }),
    });
    await expectStatus("Restablecer contraseña y revocar sesiones", passwordReset, 200);
    await expectStatus(
      "Invalidar access token anterior",
      await request("/auth/me", { headers: { Authorization: "Bearer " + firstAccessToken } }),
      401,
    );
    await expectStatus("Rechazar contraseña anterior", await login(userEmail, initialPassword), 401);
    const loginAfterReset = await login(userEmail, updatedPassword);
    await expectStatus("Aceptar contraseña restablecida", loginAfterReset, 200);
    const accessBeforeUpdate = ((await loginAfterReset.json()) as { data: { accessToken: string } }).data.accessToken;

    const { password: _initialPassword, ...updatePayload } = payload;
    const atomicUpdate = await request("/users/" + userId, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ ...updatePayload, employeeName: "Usuario Seguridad QA Actualizado" }),
    });
    await expectStatus("Actualizar perfil, roles y empresas en una sola operación", atomicUpdate, 200);
    await expectStatus(
      "Invalidar token después de actualizar acceso",
      await request("/auth/me", { headers: { Authorization: "Bearer " + accessBeforeUpdate } }),
      401,
    );

    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 5, lockedAt: new Date() },
    });
    const unlockWithReset = await request("/users/" + userId + "/password", {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ newPassword: unlockedPassword }),
    });
    await expectStatus("Restablecer una cuenta bloqueada", unlockWithReset, 200);
    await expectStatus("Permitir acceso después de desbloquear con contraseña", await login(userEmail, unlockedPassword), 200);

    const samePassword = await request("/users/" + userId + "/password", {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ newPassword: unlockedPassword }),
    });
    await expectStatus("Rechazar reutilización de contraseña", samePassword, 400);
  } finally {
    if (userId) {
      const deletion = await request("/users/" + userId, { method: "DELETE", headers: adminHeaders });
      await expectStatus("Limpiar usuario temporal", deletion, 200);
    }
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
