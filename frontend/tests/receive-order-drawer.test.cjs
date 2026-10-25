// The receiving form lives in its own component (Warehouse's module); these checks run its real setup code.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..'), front = createRequire(path.join(root, 'frontend/package.json'));
const vue = front('vue'), ts = front('typescript'), { parse, compileScript } = front('vue/compiler-sfc');
const descriptor = parse(fs.readFileSync(path.join(root, 'frontend/src/components/purchases/ReceiveOrderDrawer.vue'), 'utf8')).descriptor;
const transpile = input => ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const cache = new Map();
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function harness(orderStatus = 'sent') {
  const calls = [], emitted = [], effect = vue.effectScope();
  const request = method => (url, bodyOrConfig, config) => new Promise((resolve, reject) => calls.push({ method, url, body: method === 'post' ? bodyOrConfig : undefined, config: method === 'post' ? config : bodyOrConfig, resolve: data => resolve({ data: { data } }), reject }));
  function requireMock(spec) {
    if (spec === 'vue') return { ...vue, onMounted: fn => queueMicrotask(fn) };
    if (spec === 'lucide-vue-next') return front(spec);
    if (spec.endsWith('.vue')) return { default: {} };
    if (spec.endsWith('/http.service')) return { http: { get: request('get'), post: request('post') } };
    if (spec.endsWith('/company-context')) return { activeCompanyId: vue.ref(3) };
    if (spec.endsWith('/feedback.store')) return { useFeedbackStore: () => ({ success() {}, error() {} }) };
    if (spec.endsWith('/api-error')) return { getApiErrorMessage: (_, fallback) => fallback };
    if (spec.startsWith('../../utils/')) {
      const file = path.join(root, 'frontend/src/utils', path.basename(spec) + '.ts');
      if (!cache.has(file)) { const exports = {}; vm.runInNewContext(transpile(fs.readFileSync(file, 'utf8')), { exports, require: requireMock, Intl, Date }); cache.set(file, exports); }
      return cache.get(file);
    }
    throw Error(spec);
  }
  const exportsMock = {};
  vm.runInNewContext(transpile(compileScript(descriptor, { id: 'receive-qa' }).content), { exports: exportsMock, require: requireMock, Intl, Date, crypto: require('node:crypto') });
  const state = effect.run(() => exportsMock.default.setup({ orderId: 1 }, { expose() {}, emit: (...args) => emitted.push(args) }));
  const order = { id: 1, code: 'OC-QA', status: orderStatus, warehouseId: 39, warehouse: { name: 'General' }, supplier: { name: 'QA' }, details: [{ id: 11, product: { name: 'Teja QA' }, unit: { name: 'Unidad' }, quantity: 3, receivedQuantity: 1 }] };
  return { state, calls, emitted, order, finish: () => effect.stop(), async open() {
    await settle(); calls.find(c => c.url === '/purchase-orders/1').resolve(order); await settle();
  } };
}

test('solo se registra la recepción de una orden enviada al proveedor', async () => {
  const h = harness('approved'); await h.open();
  try { assert.equal(h.state.order.value, null); assert.match(h.state.error.value, /enviada al proveedor/); } finally { h.finish(); }
});

test('la recepción no pide espacio, queda pendiente de ubicación y valida las cantidades', async () => {
  const h = harness(); await h.open();
  try {
    assert.equal(h.state.order.value.code, 'OC-QA'); assert(!h.calls.some(c => c.url === '/purchase-catalogs'), 'ya no se consultan los espacios del almacén');
    assert.equal(h.calls.find(c => c.url === '/purchase-orders/1').config.headers['X-Company-Id'], '3');
    assert.equal(h.state.form.items.length, 1, 'solo las líneas con saldo pendiente');
    h.state.form.items[0].quantity = 1; h.state.reviewReceipt();
    assert(h.state.review.value); assert.equal(h.state.review.value.payload.items[0].quantity, 1); assert.equal('locationId' in h.state.review.value.payload.items[0], false, 'la recepción nunca envía un espacio');
    assert.match(h.state.review.value.description, /pendientes de viñeteo/); assert.match(h.state.review.value.description, /Recepción parcial/);
    h.state.review.value = null; h.state.form.items[0].quantity = 3; h.state.reviewReceipt(); assert.equal(h.state.review.value, null); assert.match(h.state.error.value, /supera lo pendiente/);
    h.state.form.items[0].quantity = 0; h.state.reviewReceipt(); assert.equal(h.state.review.value, null); assert.match(h.state.error.value, /mayor que cero/);
    h.state.form.items[0].quantity = 1.2; h.state.reviewReceipt(); assert.equal(h.state.review.value, null); assert.match(h.state.error.value, /número entero/);
    h.state.fillPending(); assert.equal(Number(h.state.form.items[0].quantity), 2, 'completar pendientes usa el saldo de la orden');
  } finally { h.finish(); }
});

test('confirmar envía la recepción una sola vez y avisa a la pantalla', async () => {
  const h = harness(); await h.open();
  try {
    h.state.form.items[0].quantity = 2; h.state.reviewReceipt();
    const first = h.state.confirm(); const second = h.state.confirm();
    const post = h.calls.filter(c => c.method === 'post'); assert.equal(post.length, 1, 'un segundo clic no repite la recepción');
    assert.equal(post[0].url, '/purchase-orders/1/receive'); assert.equal(post[0].body.items[0].quantity, 2); assert.equal(post[0].config.headers['X-Company-Id'], '3');
    post[0].resolve({}); await first; await second;
    assert.deepEqual(h.emitted.map(e => e[0]), ['received']);
  } finally { h.finish(); }
});

test('recepción total y parcial se registran sin elegir espacio y sin guardar al llenar pendientes', async () => {
  const h = harness(); await h.open();
  try {
    assert.equal(h.state.canReview.value, false, 'sin cantidades no se puede revisar');
    h.state.fillPending();
    assert.equal(h.calls.filter(c => c.method === 'post').length, 0, 'recibir todo lo pendiente solo llena las cantidades');
    assert.match(h.state.notice.value, /Revise y registre/);
    assert.equal(h.state.canReview.value, true);
    h.state.reviewReceipt();
    assert.match(h.state.review.value.description, /recibida completamente/);
    assert.deepEqual(JSON.parse(JSON.stringify(h.state.review.value.payload.items)), [{ orderDetailId: 11, quantity: 2 }], 'total: solo línea y cantidad, sin espacio');
    h.state.review.value = null; h.state.form.items[0].quantity = 1; h.state.reviewReceipt();
    assert.match(h.state.review.value.description, /Recepción parcial/);
    assert.deepEqual(JSON.parse(JSON.stringify(h.state.review.value.payload.items)), [{ orderDetailId: 11, quantity: 1 }], 'parcial: solo línea y cantidad, sin espacio');
  } finally { h.finish(); }
});
