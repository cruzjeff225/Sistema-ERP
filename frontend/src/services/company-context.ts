import { ref } from "vue";

export type AccessibleCompany = { id: number; name: string; commercialName: string };

export const activeCompanyId = ref<number | null>(null);

export function setActiveCompanyId(companyId: number | null) {
  activeCompanyId.value = companyId;
  if (typeof window === "undefined") return;
  if (companyId) window.localStorage.setItem("erp.active-company-id", String(companyId));
  else window.localStorage.removeItem("erp.active-company-id");
}

export function syncActiveCompany(companies: AccessibleCompany[]) {
  setActiveCompanyId(companies[0]?.id ?? null);
}
