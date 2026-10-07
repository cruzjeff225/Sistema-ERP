const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..'), front = createRequire(path.join(root, 'frontend/package.json'));
const vue = front('vue'), ts = front('typescript'), { parse, compileScript } = front('vue/compiler-sfc');
const descriptor = parse(fs.readFileSync(path.join(root, 'frontend/src/views/QuotationWorkspaceView.vue'), 'utf8')).descriptor;
const compiled = compileScript(descriptor, { id: 'supply-qa' }).content;
const transpile = input => ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function settle() { for (let n = 0; n < 6; ++n) { await Promise.resolve(); await vue.nextTick(); } }
function harness(permissions) {
  const company = vue.ref(3), route = vue.reactive({ path: '/purchases/quotations/manage', query: {} }), calls = [], hooks = [], effect = vue.effectScope();
  let references = 0;
  const wire = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, (url, ...args) => new Promise((resolve, reject) => calls.push({ method, url, body: method === 'get' ? undefined : args[0], config: args[method === 'get' ? 0 : 1], resolve: data => resolve({ data: { data } }), reject }))]));
  const cache = new Map();
  function requireMock(spec) {
    if (spec === 'vue') return { ...vue, onBeforeUnmount: fn => hooks.push(fn) };
    if (spec === 'vue-router') return { RouterLink: {}, useRoute: () => route, useRouter: () => ({ replace: async value => { route.query = value.query; await vue.nextTick(); } }) };
    if (spec.endsWith('.vue')) return { default: {} };
    if (spec.endsWith('/http.service')) return { http: wire };
    if (spec.endsWith('/company-context')) return { activeCompanyId: company };
    if (spec.endsWith('/usePermissions')) return { usePermissions: () => ({ can: p => !permissions || permissions.includes(p) }) };
    if (spec.endsWith('/useUnsavedChanges')) return { useUnsavedChanges: () => ({ leaving: vue.ref(false), resolveLeave() {} }) };
    if (spec.endsWith('/api-error')) return { getApiErrorMessage: (_error, fallback) => fallback };
    if (spec.startsWith('../utils/') || spec.startsWith('./')) {
      const filename = path.join(root, 'frontend/src/utils', path.basename(spec) + '.ts');
      if (!cache.has(filename)) { const exports = {}; vm.runInNewContext(transpile(fs.readFileSync(filename, 'utf8')), { exports, require: requireMock, Intl, Date }); cache.set(filename, exports); }
      return cache.get(filename);
    }
    throw new Error('Unexpected import ' + spec);
  }
  const exports = {};
  vm.runInNewContext(transpile(compiled), { exports, require: requireMock, Intl, Date, crypto: { randomUUID: () => 'ref-' + (++references) } });
  const state = effect.run(() => exports.default.setup({}, { expose() {} }));
  function initialize() { for(const call of calls){if(call.url==='/purchase-catalogs')call.resolve({ products: [], suppliers: [], branches: [], expenseTypes: [], generalWarehouse: { id: 39, branchId: 16 } });else call.resolve([]);} }
  return { state, company, route, calls, initialize, finish: () => { hooks.forEach(fn => fn()); effect.stop(); } };
}
test('quotation workspace preserves retry references, isolates company changes, and reuses saved offers', async () => {
  const retry = harness(); retry.initialize(); await settle();
  retry.state.selectedId.value = 7; retry.state.awards[1] = { quoteDetailId: 5, quantity: 20 };
  retry.state.award(); const first = retry.calls.at(-1); assert.equal(first.config.headers['X-Company-Id'], '3'); assert(first.body.requestId);
  first.reject(new Error('Network error after commit')); await settle();
  retry.state.award(); const second = retry.calls.at(-1); assert.equal(second.body.requestId, first.body.requestId, 'Retry must retain the same award reference');
  second.reject(new Error('Network error')); await settle();
  retry.state.awards[1].quantity = 21; retry.state.award();
  const changed = retry.calls.at(-1); assert.notEqual(changed.body.requestId, first.body.requestId, 'Changed selection needs a new reference');
  changed.reject(new Error('Network error')); await settle(); retry.finish();

  const context = harness(); context.initialize(); await settle();
  context.state.selectedId.value = 7; Object.assign(context.state.lineEdit, { productId: 1, purchaseQuantity: 20, reason: 'QA' });
  context.state.saveLine(); const old = context.calls.at(-1);
  context.company.value = 4; context.company.value = 3;
  assert.equal(context.state.catalogs.value.products.length, 0); assert.equal(context.state.warehouseId.value, 0);
  context.state.selectedId.value = 9; context.state.saveLine(); const newer = context.calls.at(-1);
  old.resolve({}); await settle();
  assert.equal(context.state.busy.value, true, 'Old mutation must not unlock a newer one');
  assert.equal(context.state.success.value, ''); assert.equal(context.state.selectedId.value, 9);
  newer.reject(new Error('Current request error')); await settle(); assert.equal(context.state.busy.value, false); context.finish();

  const offer = harness(); offer.initialize(); await settle();
  offer.state.selectedId.value = 7;
  offer.state.startOffer({ id: 8, supplierId: 2, quotation: null, lines: [{ quantity: 20, line: { productId: 1, unitId: 11, product: { name: 'Tejas' } } }] });
  offer.state.offerForm.details[0].unitPrice = 2; offer.state.offerForm.details[0].availableQuantity = 20;
  offer.state.saveOffer(); const initial = offer.calls.at(-1); assert.equal(initial.method, 'post'); assert.equal(initial.url, '/purchase-quotations');
  initial.resolve({ id: 77, status: 'draft', expenses: [] }); await settle();
  assert.equal(offer.calls.at(-1).url, '/purchase-quotations/77/receive');
  offer.calls.at(-1).reject(new Error('Confirmation failed')); await settle();
  assert.equal(offer.state.offer.value.quotation.id, 77);
  offer.state.saveOffer(); const correction = offer.calls.at(-1); assert.equal(correction.method, 'patch'); assert.equal(correction.url, '/purchase-quotations/77');
  correction.reject(new Error('Current edit failed')); await settle(); offer.finish();
  console.log(JSON.stringify({ status: 'PASS', checks: ['stable award UUID after network failure', 'new UUID for changed selection', 'captured company header', 'A→B→A ignores old mutation', 'old completion does not unlock a new operation', 'company switch clears catalogs and center', 'saved draft offer is reused after confirmation failure'], browser: false, databaseWrites: false }));
});
test('offer registration preloads positive availability, rejects accidental zero and keeps explicit unavailable answers',async()=>{
 const h=harness();h.initialize();await settle();
 h.state.selectedId.value=31;
 h.state.startOffer({id:49,supplierId:103,quotation:null,lines:[{quantity:10,line:{productId:94,unitId:55,product:{name:'Lámina'}}}]});
 const line=h.state.offerForm.details[0];assert.equal(line.availableQuantity,10);assert.equal(line.availabilityStatus,'available');line.unitPrice=12;line.availableQuantity=0;
 const before=h.calls.length;h.state.saveOffer();await settle();assert.equal(h.calls.length,before);assert.match(h.state.error.value,/Confirme la disponibilidad/);
 line.availabilityStatus='unavailable';h.state.saveOffer();assert.equal(h.calls.at(-1).body.details[0].availableQuantity,0);assert.equal(h.calls.at(-1).body.details[0].availabilityStatus,'unavailable');h.calls.at(-1).reject(Error('QA finished'));await settle();h.finish();
});

test('offer reference is optional for unchanged quantities and required only to support a different quoted quantity',async()=>{
 const h=harness();h.initialize();await settle();
 try{
  h.state.selectedId.value=31;
  h.state.startOffer({id:49,supplierId:103,quotation:null,lines:[{quantity:20,line:{productId:94,unitId:55,product:{name:'Lámina'}}}]});
  const line=h.state.offerForm.details[0];line.unitPrice=12;
  assert.equal(h.state.offerQuantityChanged.value,false);
  h.state.saveOffer();let request=h.calls.at(-1);
  assert.equal(request.url,'/purchase-quotations');assert.equal(request.body.providerConfirmation,'');
  assert.equal(request.body.costsConfirmed,false,'Saving a response must not invent a completed charge review');
  assert.equal(request.body.conditionsConfirmed,false);
  request.reject(Error('QA response'));await settle();
  line.quantity=30;line.availableQuantity=30;assert.equal(h.state.offerQuantityChanged.value,true);
  const before=h.calls.length;h.state.offerForm.providerConfirmation='   ';h.state.saveOffer();await settle();
  assert.equal(h.calls.length,before);assert.match(h.state.error.value,/referencia de la oferta/);
  h.state.offerForm.providerConfirmation='Cotización del proveedor C-104';h.state.saveOffer();request=h.calls.at(-1);
  assert.equal(request.body.details[0].quantity,30);assert.equal(request.body.providerConfirmation,'Cotización del proveedor C-104');
  request.reject(Error('QA response'));await settle();
 }finally{h.finish();}
});

test('quantity review allows management changes before RFQs and locks quoted quantities',async()=>{
 const manager=harness(['purchase_orders.approve']);manager.initialize();await settle();
 try{
  manager.state.current.value={id:7,quantityReviewStatus:'draft',quantityRevision:2,quantityApprovedRevision:null,rfqs:[],orders:[],lines:[]};
  assert.equal(manager.state.canAdjustProposal.value,false);
  manager.state.current.value.quantityReviewStatus='pending_review';assert.equal(manager.state.canAdjustProposal.value,true);
  manager.state.selectWorkspace('suppliers');assert.match(manager.state.error.value,/autorizar/);assert.equal(manager.state.workspace.value,'products');
  manager.state.current.value.quantityReviewStatus='approved';manager.state.current.value.quantityApprovedRevision=2;assert.equal(manager.state.quantitiesAuthorized.value,true);assert.equal(manager.state.canAdjustProposal.value,false);
  manager.state.current.value.quantityRevision=3;assert.equal(manager.state.quantitiesAuthorized.value,false,'Una autorización de otra versión no habilita cotizaciones');
  manager.state.current.value.quantityReviewStatus='pending_review';manager.state.current.value.rfqs=[{id:1}];assert.equal(manager.state.canAdjustProposal.value,false);
 }finally{manager.finish()}
 const buyer=harness(['purchase_quotations.update','purchase_quotations.view']);buyer.initialize();await settle();
 try{buyer.state.current.value={quantityReviewStatus:'draft',rfqs:[],orders:[]};assert.equal(buyer.state.canAdjustProposal.value,true);buyer.state.current.value.quantityReviewStatus='pending_review';assert.equal(buyer.state.canAdjustProposal.value,false);}finally{buyer.finish()}
});

test('quantity approval sends the reviewed revision once and preserves company scope',async()=>{
 const qa=harness(['purchase_orders.approve']);qa.initialize();await settle();
 try{qa.state.selectedId.value=7;qa.state.current.value={id:7,quantityReviewStatus:'pending_review',quantityRevision:4,rfqs:[],orders:[],lines:[]};qa.state.quantityDecision.value='approve';
  qa.state.reviewQuantities();const call=qa.calls.at(-1);assert.equal(call.url,'/supply/consolidations/7/quantities/approve');assert.equal(call.body.expectedRevision,4);assert.equal(call.config.headers['X-Company-Id'],'3');
  const count=qa.calls.length;qa.state.reviewQuantities();assert.equal(qa.calls.length,count);call.reject(Error('QA done'));await settle();assert.equal(qa.state.busy.value,false);
 }finally{qa.finish()}
});

test('workspace guides the current task and distinguishes incomplete responses from received offers', async () => {
 const h=harness();h.initialize();await settle();
 try {
  const process={id:7,quantityReviewStatus:'draft',quantityRevision:2,quantityApprovedRevision:null,rfqs:[],orders:[],lines:[{id:1,purchaseQuantity:10,purchasedQuantity:0}]};
  h.state.current.value=process;assert.equal(h.state.nextStep.value.action,'quantities');
  h.state.current.value.quantityReviewStatus='returned';h.state.current.value.quantityReviewNotes='Comprar 12';assert.match(h.state.nextStep.value.description,/observaciones/);
  Object.assign(h.state.current.value,{quantityReviewStatus:'approved',quantityApprovedRevision:2});assert.equal(h.state.nextStep.value.action,'suppliers');
  h.state.current.value.rfqs=[{id:49,quotation:{status:'draft',orders:[]}}];assert.equal(h.state.nextStep.value.action,'offer');assert.equal(h.state.receivedQuotes.value.length,0);
  h.state.current.value.rfqs[0].quotation.status='received';assert.equal(h.state.nextStep.value.action,'compare');assert.equal(h.state.receivedQuotes.value.length,1);
  h.state.current.value.rfqs[0].quotation.status='under_review';assert.equal(h.state.receivedQuotes.value.length,1,'Offers under review remain valid comparison inputs');
  h.state.current.value.orders=[{id:3,status:'cancelled'},{id:4,status:'rejected'}];assert.equal(h.state.nextStep.value.action,'compare','Closed orders must not send the buyer away from the remaining products');
  h.state.current.value.orders.push({id:5,status:'pending_approval'});h.state.current.value.lines[0].purchasedQuantity=10;assert.equal(h.state.nextStep.value.action,'orders');
  assert.equal(h.state.orderStatusLabel('pending_approval'),'Pendiente de Gerencia');
 } finally {h.finish();}
});

test('RFQ deep links are consumed once so saving an offer returns to its purchase process', async () => {
 const h=harness();h.initialize();await settle();
 try {
  const rfq={id:49,supplierId:103,quotation:null,lines:[{quantity:10,line:{productId:94,unitId:55,product:{name:'Lámina'}}}]};
  const process={id:7,quantityReviewStatus:'approved',quantityRevision:2,quantityApprovedRevision:2,orders:[],rfqs:[rfq],lines:[{id:1,purchaseQuantity:10,purchasedQuantity:0}]};
  h.state.current.value=process;h.state.selectedId.value=7;
  h.route.query={id:'7',rfqId:'49'};await settle();assert.equal(h.calls.at(-1).url,'/supply/consolidations/7');h.calls.at(-1).resolve(process);await settle();
  assert.equal(h.state.offer.value.id,49);assert.equal(h.route.query.rfqId,undefined,'A one-time editor target must not reopen on every refresh');
  h.state.offerForm.details[0].unitPrice=12;h.state.saveOffer();assert.equal(h.calls.at(-1).url,'/purchase-quotations');h.calls.at(-1).resolve({id:77,status:'received',orders:[],expenses:[]});await settle();
  const reload=h.calls.at(-1);assert.equal(reload.url,'/supply/consolidations/7');reload.resolve({...process,rfqs:[{...rfq,quotation:{id:77,status:'received',orders:[],expenses:[]}}]});await settle();
  assert.equal(h.state.offer.value,null);assert.equal(h.state.nextStep.value.action,'compare');assert.match(h.state.success.value,/Oferta recibida/);
 } finally {h.finish();}
});

test('responses can be corrected after rejected or cancelled orders without unlocking active purchases', async () => {
 const h=harness(['purchase_quotations.update']);h.initialize();await settle();
 try {
  assert.equal(h.state.canRegisterResponse({quotation:{status:'selected',orders:[{status:'rejected'},{status:'cancelled'}]}}),true);
  assert.equal(h.state.canRegisterResponse({quotation:{status:'selected',orders:[{status:'returned'}]}}),false);
  assert.equal(h.state.canRegisterResponse({quotation:{status:'received',orders:[{status:'pending_approval'}]}}),false);
  h.state.startOffer({id:49,supplierId:103,quotation:null,lines:[{quantity:10,line:{productId:94,unitId:55,product:{name:'Lámina'}}}]});
  h.state.offerForm.details[0].quantity=15;assert.equal(h.state.consultedQuantity(h.state.offerForm.details[0]),10,'The original consulted quantity is independent from the received offer');
 } finally {h.finish();}
});

test('a provider already consulted is excluded from new RFQs in the same purchase', async () => {
 const h=harness();h.initialize();await settle();
 try {
  h.state.catalogs.value.suppliers=[{id:102,name:'Proveedor A'},{id:103,name:'Proveedor B'}];
  h.state.current.value={rfqs:[{id:49,supplierId:102}],orders:[],lines:[]};
  assert.deepEqual(Array.from(h.state.availableSuppliers.value,supplier=>supplier.id),[103]);
  h.state.current.value.rfqs.push({id:50,supplierId:103});assert.equal(h.state.availableSuppliers.value.length,0);
 } finally {h.finish();}
});
