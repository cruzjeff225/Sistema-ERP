import { http } from './http.service';
import { activeCompanyId } from './company-context';

/** Consulta de solo lectura del módulo de inventario en la empresa activa; `company` permite descartar respuestas tardías. */
export async function inventoryGet<T>(path: string, params: Record<string, unknown> = {}) {
  const company = activeCompanyId.value;
  const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 0 && value !== false));
  const response = await http.get(`/inventory/${path}`, { params: clean, headers: { 'X-Company-Id': String(company) } });
  return { data: response.data.data as T, company };
}

export async function inventoryPost<T>(path: string, body: unknown) {
  const company = activeCompanyId.value;
  const response = await http.post(`/inventory/${path}`, body, { headers: { 'X-Company-Id': String(company) } });
  return { data: response.data.data as T, company };
}
