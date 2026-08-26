import { ref } from "vue";

export type AccessibleCompany = { id: number; name: string; commercialName: string };

function storedCompanyId() {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem("erp.active-company-id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export const activeCompanyId = ref<number | null>(storedCompanyId());

export function setActiveCompanyId(companyId: number | null) {
  activeCompanyId.value = companyId;
  if (typeof window === "undefined") return;
  if (companyId) window.localStorage.setItem("erp.active-company-id", String(companyId));
  else window.localStorage.removeItem("erp.active-company-id");
}

export function syncActiveCompany(companies: AccessibleCompany[]) {
  if (activeCompanyId.value && companies.some((company) => company.id === activeCompanyId.value)) return;
  setActiveCompanyId(companies[0]?.id ?? null);
}
