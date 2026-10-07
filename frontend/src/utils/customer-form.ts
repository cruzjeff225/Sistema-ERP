export type CustomerForm = {
  name: string; document: string; phone: string; email: string; address: string;
  countryId: string; departmentId: string; municipalityId: string; districtId: string;
};

export function customerFormPayload(form: CustomerForm, isNational: boolean) {
  const positiveId = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  if (!form.name.trim()) throw new Error('Escribe el nombre o razón social del cliente.');
  if (!positiveId(form.countryId)) throw new Error('Selecciona el país del cliente.');
  if (isNational && ![form.departmentId, form.municipalityId, form.districtId].every(positiveId)) throw new Error('Completa el departamento, municipio y distrito.');
  const optional = (value: string) => value.trim() || null;
  return {
    name: form.name.trim(), document: optional(form.document), phone: optional(form.phone), email: optional(form.email), address: optional(form.address),
    countryId: Number(form.countryId), departmentId: isNational ? Number(form.departmentId) : null,
    municipalityId: isNational ? Number(form.municipalityId) : null, districtId: isNational ? Number(form.districtId) : null,
  };
}
