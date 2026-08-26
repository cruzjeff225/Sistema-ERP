import { createHmac } from "crypto";

const baseUrl = process.env.ERP_TEST_API_URL ?? "http://localhost:3000/api";
const email = process.env.ERP_TEST_EMAIL;
const password = process.env.ERP_TEST_PASSWORD;
const accessSecret = process.env.ERP_TEST_ACCESS_SECRET ?? "";

if (!email || !password || !accessSecret) {
  throw new Error("Defina ERP_TEST_EMAIL, ERP_TEST_PASSWORD y ERP_TEST_ACCESS_SECRET antes de ejecutar la verificacion funcional.");
}

type ApiResponse = { success: boolean; data: unknown };
type RecordWithId = { id: number };

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init);
}

async function expectStatus(name: string, response: Response, expected: number) {
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${name}: se esperaba HTTP ${expected}, se recibio ${response.status}. ${body}`);
  }
  console.log(`OK ${name}`);
}

async function getJson(path: string, token: string) {
  const response = await request(path, { headers: { Authorization: `Bearer ${token}` } });
  await expectStatus(`GET ${path}`, response, 200);
  return (await response.json()) as ApiResponse;
}

async function verifyProductImageLifecycle(token: string, productId: number) {
  const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLXDwAAAABJRU5ErkJggg==", "base64");
  const uploadForm = new FormData();
  uploadForm.append("productId", String(productId));
  uploadForm.append("file", new Blob([imageBytes], { type: "image/png" }), "verification-image.png");

  const upload = await request("/product-images/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: uploadForm,
  });
  await expectStatus("Cargar imagen de producto", upload, 201);
  const uploaded = (await upload.json()) as { data: { id: number; path: string } };
  const imageId = uploaded.data.id;
  const staticBaseUrl = baseUrl.replace(/\/api\/?$/, "");

  try {
    await expectStatus("Mostrar imagen cargada", await fetch(`${staticBaseUrl}${uploaded.data.path}`), 200);

    const replacementForm = new FormData();
    replacementForm.append("file", new Blob([imageBytes], { type: "image/png" }), "replacement-image.png");
    const replacement = await request(`/product-images/${imageId}/upload`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: replacementForm,
    });
    await expectStatus("Reemplazar archivo de imagen", replacement, 200);
    const replaced = (await replacement.json()) as { data: { path: string } };
    await expectStatus("Mostrar imagen reemplazada", await fetch(`${staticBaseUrl}${replaced.data.path}`), 200);
    await expectStatus("Eliminar archivo anterior al reemplazar", await fetch(`${staticBaseUrl}${uploaded.data.path}`), 404);

    const imageUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
    const update = await request(`/product-images/${imageId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path: imageUrl }),
    });
    await expectStatus("Cambiar imagen por URL", update, 200);
    await expectStatus("Eliminar archivo al usar URL", await fetch(`${staticBaseUrl}${replaced.data.path}`), 404);
  } finally {
    const deletion = await request(`/product-images/${imageId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    await expectStatus("Eliminar imagen de producto", deletion, 200);
  }

  const images = records((await getJson(`/product-images?productId=${productId}`, token)).data);
  if (images.some((image) => image.id === imageId)) throw new Error("La imagen eliminada continúa visible en la galería");
  console.log("OK Ocultar imagen eliminada de la galería");
}

function records(data: unknown): RecordWithId[] {
  return Array.isArray(data)
    ? data.filter((item): item is RecordWithId => typeof item === "object" && item !== null && "id" in item && typeof item.id === "number")
    : [];
}

function createAccessToken(permissions: string[]) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: 1,
    username: "security-test",
    email: "security-test@erp.local",
    roles: [],
    permissions,
    iat: now,
    exp: now + 300,
  })).toString("base64url");
  const signature = createHmac("sha256", accessSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function main() {
  await expectStatus("API protegida sin sesion", await request("/companies"), 401);

  const login = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  await expectStatus("Inicio de sesion", login, 200);
  const loginPayload = (await login.json()) as { data: { accessToken: string } };
  const token = loginPayload.data.accessToken;

  const routes = [
    "/auth/me",
    "/users?limit=5",
    "/roles",
    "/permissions",
    "/modules",
    "/logs?limit=5",
    "/logs/users",
    "/companies",
    "/branches",
    "/warehouse-categories",
    "/warehouses",
    "/locations",
    "/catalogs/geography",
    "/catalogs/countries",
    "/suppliers",
    "/supplier-catalogs/countries",
    "/products",
    "/products/catalogs",
    "/product-categories",
    "/product-subcategories",
    "/product-units",
  ];

  for (const route of routes) await getJson(route, token);

  const suppliers = records((await getJson("/suppliers", token)).data);
  if (suppliers[0]) {
    const supplierId = suppliers[0].id;
    await getJson(`/supplier-contacts?supplierId=${supplierId}`, token);
    await getJson(`/suppliers/${supplierId}/history`, token);
    await getJson(`/suppliers/${supplierId}/purchases`, token);
  }

  const products = records((await getJson("/products", token)).data);
  if (products[0]) {
    const productId = products[0].id;
    await getJson(`/product-images?productId=${productId}`, token);
    await getJson(`/product-suppliers?productId=${productId}`, token);
    await verifyProductImageLifecycle(token, productId);
  }

  const companies = records((await getJson("/companies", token)).data);
  if (companies[0]) {
    const activateOnlyToken = createAccessToken(["companies.activate"]);
    const forbiddenStatusChange = await request(`/companies/${companies[0].id}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${activateOnlyToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    await expectStatus("Permiso de activacion no permite desactivar", forbiddenStatusChange, 403);

    const deactivateOnlyToken = createAccessToken(["companies.deactivate"]);
    const forbiddenStringActivation = await request(`/companies/${companies[0].id}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${deactivateOnlyToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: "true" }),
    });
    await expectStatus("Estado textual no permite cruzar permisos", forbiddenStringActivation, 403);
  }

  const invalidLocation = await request("/locations", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ warehouseId: 1, code: "INVALID-CAPACITY", aisle: "A", rack: "A", level: "1", position: "1", capacity: 0 }),
  });
  await expectStatus("Capacidad de espacio invalida", invalidLocation, 400);

  const invalidBranchPhone = await request("/branches", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: 1,
      name: "Sucursal de prueba invalida",
      address: "Direccion de prueba",
      departmentId: 1,
      municipalityId: 1,
      districtId: 1,
      phone: "telefono-invalido",
    }),
  });
  await expectStatus("Telefono de sucursal invalido", invalidBranchPhone, 400);

  const invalidUser = await request("/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  await expectStatus("Usuario invalido sin rol", invalidUser, 400);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
