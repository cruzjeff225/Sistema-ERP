import { http } from './http.service';
import { activeCompanyId } from './company-context';

/** Consulta de solo lectura del módulo de inventario en la empresa activa; `company` permite descartar respuestas tardías. */
export async function inventoryGet<T>(path: string, params: Record<string, unknown> = {}) {
  const company = activeCompanyId.value;
  const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 0 && value !== false));
  const response = await http.get(`/inventory/${path}`, { params: clean, headers: { 'X-Company-Id': String(company) } });
  return { data: response.data.data as T, company };
}

/** Descarga un archivo del módulo (Kardex en Excel o PDF) con los mismos filtros de la pantalla. */
export async function inventoryDownload(path: string, params: Record<string, unknown> = {}) {
  const company = activeCompanyId.value;
  const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 0 && value !== false));
  const response = await http.get(`/inventory/${path}`, { params: clean, responseType: 'blob', headers: { 'X-Company-Id': String(company) } });
  return { blob: response.data as Blob, company };
}

/** Con `responseType: 'blob'` el error llega como archivo; se lee el mensaje que mandó la API. */
export async function downloadError(caught: unknown, fallback: string) {
  const data = (caught as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try { const body = JSON.parse(await data.text()) as { message?: string | string[] }; const message = Array.isArray(body.message) ? body.message.join(' · ') : body.message; if (message) return message; } catch { /* no era JSON */ }
  }
  return fallback;
}

export async function inventoryPost<T>(path: string, body: unknown) {
  const company = activeCompanyId.value;
  const response = await http.post(`/inventory/${path}`, body, { headers: { 'X-Company-Id': String(company) } });
  return { data: response.data.data as T, company };
}
