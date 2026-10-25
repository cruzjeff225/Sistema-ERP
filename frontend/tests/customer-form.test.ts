import assert from 'node:assert/strict';
import test from 'node:test';
import { customerFormPayload, type CustomerForm } from '../src/utils/customer-form';
const form = (changes: Partial<CustomerForm> = {}): CustomerForm => ({ name: ' Cliente ', document: '', phone: '', email: '', address: '', countryId: '1', departmentId: '2', municipalityId: '3', districtId: '4', ...changes });

test('clientes: los datos opcionales vacíos se pueden guardar y borrar', () => {
  const value = customerFormPayload(form(), true);
  assert.equal(value.name, 'Cliente');
  assert.equal(value.email, null); assert.equal(value.document, null); assert.equal(value.phone, null); assert.equal(value.address, null);
  assert.equal(value.districtId, 4);
});
test('clientes: cambiar a extranjero elimina la ubicación nacional anterior', () => {
  const value = customerFormPayload(form({ countryId: '9', email: ' cliente@example.test ' }), false);
  assert.equal(value.countryId, 9); assert.equal(value.email, 'cliente@example.test');
  assert.equal(value.departmentId, null); assert.equal(value.municipalityId, null); assert.equal(value.districtId, null);
});
test('clientes: exige nombre, país válido y ubicación nacional completa', () => {
  assert.throws(() => customerFormPayload(form({ name: '  ' }), true));
  for (const countryId of ['', '0', '-1', '1.5', 'NaN', '9007199254740993']) assert.throws(() => customerFormPayload(form({ countryId }), false));
  assert.throws(() => customerFormPayload(form({ districtId: '' }), true));
});
