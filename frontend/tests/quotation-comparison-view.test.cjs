const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..'), front = createRequire(path.join(root, 'frontend/package.json'));
const vue = front('vue'), ts = front('typescript'), compiler = front('vue/compiler-sfc');
const descriptor = compiler.parse(fs.readFileSync(path.join(root, 'frontend/src/views/QuotationComparisonView.vue'), 'utf8')).descriptor;
const script = compiler.compileScript(descriptor, { id: 'comparison-qa' }).content;
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date());
async function settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); await vue.nextTick(); } }
function fixture() {
  const supplier = (id, name) => ({ id, name, isActive: true, deletedAt: null });
  const line = (id, name, quantity) => ({ id, product: { id, name, sku: 'SKU-' + id }, unit: { name: 'Unidad' }, requestedQuantity: quantity, purchaseQuantity: quantity, purchasedQuantity: 0, sources: [] });
  const detail = (id, lineId, quantity, price) => ({ id, consolidationLineId: lineId, quantity, availableQuantity: quantity, unitPrice: price, discount: 0, taxRate: 0 });
  const rfq = (id, provider, details) => ({ id, supplierId: provider.id, supplier: provider, quotation: { id, code: 'COT-' + id, currency: 'USD', status: 'under_review', validUntil: today(), paymentTerms: 'Crédito 30 días', deliveryDays: 3, details, orders: [], expenses: [] } });
  return { id: 30, code: 'CON-QA', dateFrom: today(), dateTo: today(), createdAt: new Date().toISOString(), lines: [line(1, 'Tejas', 10), line(2, 'Láminas', 5)], rfqs: [rfq(1, supplier(1, 'Proveedor A'), [detail(11, 1, 10, 10)]), rfq(2, supplier(2, 'Proveedor B'), [detail(21, 1, 4, 8), detail(22, 2, 5, 20)]), rfq(3, supplier(3, 'Proveedor C'), [detail(31, 1, 10, 12)])], orders: [] };
}
function harness(allowed = true) {
  const company = vue.ref(3), route = vue.reactive({ query: {} }), calls = [], hooks = [], cache = new Map(), effect = vue.effectScope();
  const permissions = vue.ref(allowed), wire = Object.fromEntries(['get', 'post'].map(method => [method, (url, ...args) => new Promise((resolve, reject) => calls.push({ method, url, body: method === 'post' ? args[0] : undefined, config: args[method === 'post' ? 1 : 0], resolve: data => resolve({ data: { data } }), reject }))]));
  function requireMock(spec) {
    if (spec === 'vue') return { ...vue, onBeforeUnmount: fn => hooks.push(fn) };
    if (spec === 'vue-router') return { RouterLink: {}, useRoute: () => route };
    if (spec === 'lucide-vue-next') return front(spec);
    if (spec.endsWith('.vue')) return { default: {} };
    if (spec.endsWith('/http.service')) return { http: wire };
    if (spec.endsWith('/company-context')) return { activeCompanyId: company };
    if (spec.endsWith('/usePermissions')) return { usePermissions: () => ({ can: key => permissions.value === true || permissions.value.includes(key) }) };
    if (spec.endsWith('/useUnsavedChanges')) return { useUnsavedChanges: () => ({ leaving: vue.ref(false), resolveLeave() {} }) };
    if (spec.endsWith('/api-error')) return { getApiErrorMessage: (_, fallback) => fallback };
    if (spec.startsWith('../utils/') || spec.startsWith('./')) {
      const file = path.join(root, 'frontend/src/utils', path.basename(spec) + '.ts');
      if (!cache.has(file)) { const exports = {}; vm.runInNewContext(transpile(fs.readFileSync(file, 'utf8')), { exports, require: requireMock, Intl, Date }); cache.set(file, exports); }
      return cache.get(file);
    }
    throw Error(spec);
  }
  const exports = {};
  vm.runInNewContext(transpile(script), { exports, require: requireMock, Intl, Date, crypto: require('node:crypto'),setTimeout:()=>0,clearTimeout(){} });
  const state = effect.run(() => exports.default.setup({}, { expose() {} }));
  function confirmCosts(){state.serverComparison.value={processId:state.selectedId.value,comparisonHash:'a'.repeat(64),rows:[],suppliers:[],supplierTotals:[],selection:[],recommendation:null};state.comparing.value=false;state.comparisonReady.value=true;}
  async function initialize(data = fixture()) { calls[0].resolve([]); calls[1].resolve({ generalWarehouse: { id: 39, branchId: 16, name: 'Almacén general' } }); await settle(); state.applyCurrent(data, data.id);confirmCosts(); }
  return { state, calls, company, permissions, initialize,confirmCosts, finish: () => { hooks.forEach(fn => fn()); effect.stop(); } };
}

test('fractional product selection cannot be reviewed or sent to create orders',async()=>{
 const h=harness();await h.initialize();
 try{const s=h.state;s.choose(11);s.selections.value[1].quantity=1.2;assert.equal(s.invalidSelection.value,true);const before=h.calls.length,step=s.step.value;s.reviewSelection();s.award();assert.equal(h.calls.length,before);assert.equal(s.step.value,step);s.selections.value[1].quantity=2;assert.equal(s.invalidSelection.value,false);}finally{h.finish();}
});

test('minimum quantities are revalidated after editing and reasons stay actionable',async()=>{
 const h=harness(),data=fixture();data.rfqs[0].quotation.details[0].minimumQuantity=5;await h.initialize(data);
 try{const s=h.state;assert.equal(s.comparisonMode.value,'product');s.choose(11);s.selections.value[1].quantity=3;assert(s.invalidSelection.value);assert.match(s.selectionIssues.value[0],/Tejas: No cumple la cantidad mínima/);const count=h.calls.length;await s.award();assert.equal(h.calls.length,count);assert.match(await html(s),/No cumple la cantidad mínima/);s.selections.value[1].quantity=5;assert.equal(s.invalidSelection.value,false);}finally{h.finish();}
});

test('recorded offers with zero prices or mismatched units explain the problem and link to the right supplier',async()=>{
 const data=fixture();data.lines[0].unitId=1;data.rfqs[0].quotation.details[0].unitId=2;data.rfqs[1].quotation.details[0].unitId=1;data.rfqs[1].quotation.details[0].unitPrice=0;data.rfqs[2].quotation.details[0].unitId=1;data.rfqs[2].quotation.details[0].availabilityStatus='unconfirmed';
 const h=harness();await h.initialize(data);try{const s=h.state;assert.equal(s.availableOffers.value.length,0);const output=await html(s);assert.match(output,/Unidad no equivalente/);assert.match(output,/Precio pendiente de confirmar/);assert.match(output,/Disponibilidad por confirmar/);assert.match(output,/id=30&amp;rfqId=1/);assert.match(output,/Precio registrado/);assert.match(output,/<details[^>]*open/);}finally{h.finish();}
});

test('fresh server rejection prevents review and updating offers preserves selections for correction',async()=>{
 const h=harness();await h.initialize();try{const s=h.state;s.choose(11);h.confirmCosts();s.serverComparison.value.rows=[{lineId:1,product:{name:'Tejas'},cells:[{detailId:11,eligible:false,label:'Oferta vencida'}]}];assert(s.invalidSelection.value);s.reviewSelection();assert.equal(s.step.value,'compare');const updated=fixture();updated.rfqs[0].quotation.details[0].availableQuantity=4;const refresh=s.refreshOffers();h.calls.at(-1).resolve(updated);await refresh;assert.equal(s.selections.value[1].detailId,11);assert.equal(s.selections.value[1].quantity,10);assert(s.invalidSelection.value);assert.match(s.selectionIssues.value[0],/hasta 4/);assert.equal(s.comparisonReady.value,false);}finally{h.finish();}
});

test('complete supplier selection is accessible in the guided view and requires fresh calculations',async()=>{
 const h=harness();await h.initialize();try{const s=h.state;s.serverComparison.value.supplierTotals=[{supplierId:3,supplier:'Proveedor C',complete:true,group:{total:120,currency:'USD'},details:[{quotationDetailId:31,quantity:10}]}];assert.match(await html(s),/Comprar todo a un proveedor/);s.comparisonReady.value=false;s.selectFullSupplier(3);assert.equal(s.pickedCount.value,0);s.comparisonReady.value=true;s.selectFullSupplier(3);assert.equal(s.selections.value[1].detailId,31);}finally{h.finish();}
});

test('creating and selecting permissions alone cannot submit orders to management',async()=>{
 const h=harness(['purchase_quotations.select','purchase_orders.create']);await h.initialize();try{const s=h.state;s.choose(11);h.confirmCosts();const count=h.calls.length;await s.award();assert.equal(h.calls.length,count);assert.equal(s.canAward.value,false);}finally{h.finish();}
});

test('switching to a supplier with a larger minimum exposes the correction instead of ignoring the click',async()=>{
 const h=harness(),data=fixture();data.rfqs[2].quotation.details[0].minimumQuantity=5;await h.initialize(data);
 try{const s=h.state;s.choose(11);s.selections.value[1].quantity=2;h.confirmCosts();s.serverComparison.value.rows=[{lineId:1,product:{name:'Tejas'},cells:[{detailId:31,eligible:false,label:'No cumple la cantidad mínima'}]}];s.choose(31);assert.equal(s.selections.value[1].detailId,31);assert.equal(s.selections.value[1].quantity,2,'no aumenta lo elegido por el comprador');assert(s.invalidSelection.value);assert.match(s.selectionIssues.value[0],/cantidad mínima/);s.selections.value[1].quantity=5;assert.equal(s.invalidSelection.value,false);}finally{h.finish();}
});

test('a product bought concurrently can be removed after refresh without losing other selections',async()=>{
 const h=harness();await h.initialize();try{const s=h.state;s.choose(11);s.focusProduct(2);s.choose(22);s.focusProduct(1);const changed=fixture();changed.lines[0].purchasedQuantity=10;const refresh=s.refreshOffers();h.calls.at(-1).resolve(changed);await refresh;assert(s.invalidSelection.value);assert.match(await html(s),/Quitar de mi selección/);s.removeSelection(1);assert.equal(s.selections.value[1],undefined);assert.equal(s.selections.value[2].detailId,22);assert.equal(s.invalidSelection.value,false);s.clearSelection();assert.equal(s.hasSelection.value,false);}finally{h.finish();}
});

test('a changed comparison blocks repeated submission until offers are updated',async()=>{
 const h=harness();await h.initialize();try{const s=h.state;s.choose(11);h.confirmCosts();const award=s.award();h.calls.at(-1).reject({response:{status:409}});await award;assert.equal(s.comparisonReady.value,false);assert.match(s.error.value,/Actualice las ofertas/);const count=h.calls.length;await s.award();assert.equal(h.calls.length,count);}finally{h.finish();}
});
const compiledTemplate = compiler.compileTemplate({ source: descriptor.template.content, filename: 'QuotationComparisonView.vue', id: 'comparison-qa', ssr: true, cssVars: [], compilerOptions: { expressionPlugins: ['typescript'] } });
assert.equal(compiledTemplate.errors.length, 0);
const renderExports = {}; vm.runInNewContext(transpile(compiledTemplate.code), { exports: renderExports, require: front });
async function html(state) {
  const app = vue.createSSRApp(vue.defineComponent({ setup: () => ({ ...state }), ssrRender: renderExports.ssrRender }));
  const slot = tag => vue.defineComponent({ setup: (_, { slots }) => () => vue.h(tag, {}, slots.default?.()) });
  app.config.warnHandler = message => { throw Error(message); };
  app.component('AdminLayout', slot('main')); app.component('PurchasesNav', slot('nav'));
  app.component('PurchaseSectionHeader', vue.defineComponent({ props: ['title','description'], setup: (p,{slots}) => () => vue.h('header', [vue.h('h1',p.title),vue.h('p',p.description),slots.actions?.()]) }));
  app.component('PurchaseTabs', vue.defineComponent({ props: ['items'], setup: p => () => vue.h('div', p.items.map(item => vue.h('span',item.label))) }));
  app.component('AppButton', vue.defineComponent({ props: ['disabled','type'], setup: (p,{slots}) => () => vue.h('button',{disabled:p.disabled,type:p.type||'button'},slots.default?.()) }));
  app.component('RouterLink',vue.defineComponent({props:['to'],setup:(p,{slots})=>()=>vue.h('a',{href:p.to},slots.default?.())}));
  app.component('PurchaseActionDialog',slot('dialog'));
  for (const icon of ['ArrowLeft','ArrowRight','Check','CheckCircle2','ChevronDown','ChevronRight','FileSearch','Package','ShoppingCart','SlidersHorizontal','X']) app.component(icon,vue.defineComponent({setup:()=>()=>vue.h('svg')}));
  return front('vue/server-renderer').renderToString(app);
}
test('comparison keeps the same quantities, shows partial availability, and recalculates changed quantities', async () => {
  const h = harness(); await h.initialize(); const s = h.state;
  assert.equal(s.comparison.value.recommendation.offer.detail.id,11,'A full offer must outrank a cheaper partial offer');
  assert.equal(s.offers.value.find(o=>o.detail.id===11).preview.total,100);
  assert.equal(s.offers.value.find(o=>o.detail.id===21).previewQuantity,4);
  s.choose(11);s.selections.value[1].quantity=3;
  assert.equal(s.maxQuantity(),10,'An edited quantity must not become its own maximum');
  assert.equal(s.offers.value.find(o=>o.detail.id===11).preview.total,30);
  assert.equal(s.offers.value.find(o=>o.detail.id===21).preview.total,24);
  s.choose(21);assert.equal(s.selections.value[1].quantity,3,'Changing suppliers preserves the chosen quantity within availability');
  const output=await html(s);assert.match(output,/name="supplier-1"/);assert.match(output,/Precio unitario/);assert.match(output,/Total estimado/);assert.match(output,/por 3 Unidad/);assert.doesNotMatch(output,/Crear órdenes de compra/);
  h.finish();
});
test('selection survives product navigation, review groups by supplier, and edited quantities update order totals', async () => {
  const h=harness();await h.initialize();const s=h.state;
  s.choose(11);s.nextProduct();assert.equal(s.productId.value,2);assert.equal(s.selections.value[1].detailId,11);
  s.choose(22);s.nextProduct();assert.equal(s.step.value,'review');assert.equal(s.summary.value.length,2);assert.equal(s.totals.value[0].amount,200);
  s.selections.value[1].quantity=5;assert.equal(s.totals.value[0].amount,150);
  const output=await html(s);assert.match(output,/Generar órdenes y enviar a Gerencia/);assert.match(output,/Total de la orden/);assert.match(output,/Almacén general/);assert.doesNotMatch(output,/Ofertas de proveedores/);
  s.focusProduct(1);assert.equal(s.step.value,'compare');assert.equal(s.selections.value[2].detailId,22);
  h.finish();
});
test('all partial offers show the same comparison quantity and choosing buys the amount displayed',async()=>{
  const data=fixture();data.rfqs[0].quotation.details[0].quantity=2;data.rfqs[0].quotation.details[0].availableQuantity=2;data.rfqs=data.rfqs.slice(0,2);
  const h=harness();await h.initialize(data);const s=h.state;assert.equal(s.comparison.value.comparisonQuantity,2);
  assert.equal(s.offers.value[0].previewQuantity,2);assert.equal(s.offers.value[1].previewQuantity,2);
  s.choose(21);assert.equal(s.selections.value[1].quantity,2);assert.equal(s.totals.value[0].amount,16);assert.equal(s.maxQuantity(),4);
  const output=await html(s);assert.match(output,/Quedarán 8 Unidad por comprar/);s.selections.value[1].quantity=4;assert.equal(s.totals.value[0].amount,32);h.finish();
});
test('invalid quantities and consultation-only permissions cannot award; mixed currencies are not added', async () => {
  const h=harness();await h.initialize();const s=h.state;
  s.choose(11);s.selections.value[1].quantity=11;assert(s.invalidSelection.value);const count=h.calls.length;await s.award();assert.equal(h.calls.length,count);s.reviewSelection();assert.equal(s.step.value,'compare');
  s.selections.value[1].quantity=0;assert(s.invalidSelection.value);s.selections.value[1].quantity=1.001;assert(s.invalidSelection.value);s.selections.value[1].quantity=1;
  s.current.value.rfqs[1].quotation.currency='EUR';s.focusProduct(2);s.choose(22);assert.equal(s.totals.value.length,2);assert.equal(s.totals.value.find(t=>t.currency==='USD').amount,10);assert.equal(s.totals.value.find(t=>t.currency==='EUR').amount,100);
  h.permissions.value=['purchase_quotations.view','purchase_orders.view'];s.focusProduct(1);s.removeSelection(1);assert(s.selections.value[1]);s.choose(31);assert.equal(s.selections.value[1].detailId,11);await s.award();assert.equal(h.calls.length,count);
  const output=await html(s);assert.match(output,/<input[^>]*type="radio"[^>]*disabled/);assert.match(output.match(/<input[^>]*type="number"[^>]*>/)[0],/\bdisabled\b/);assert.doesNotMatch(output,/Confirmar y crear órdenes/);h.finish();
});
test('completed purchases show order links rather than blocked offer choices',async()=>{
  const data=fixture();data.lines.forEach(line=>line.purchasedQuantity=line.purchaseQuantity);data.orders=[{id:116,code:'OC-00116',status:'received',supplierId:1,quotationId:1}];
  const h=harness();await h.initialize(data);assert(h.state.allOrdered.value);const output=await html(h.state);assert.match(output,/Este producto ya está en una orden/);assert.match(output,/\/purchases\/orders\?id=116/);assert.doesNotMatch(output,/name="supplier-|No hay ofertas disponibles para elegir|Confirmar y crear órdenes/);h.finish();
});
test('review award reuses reference after network failure and ignores an old company response',async()=>{
  const h=harness();await h.initialize();const s=h.state;s.choose(11);s.reviewSelection();h.confirmCosts();
  const first=s.award(),initial=h.calls.at(-1);assert.equal(initial.config.headers['X-Company-Id'],'3');initial.reject(Error('Response lost'));await first;
  const retry=s.award(),again=h.calls.at(-1);assert.equal(again.body.requestId,initial.body.requestId);assert.equal(again.body.details[0].quantity,10);
  h.company.value=4;assert.equal(s.current.value,null);assert.equal(Object.keys(s.selections.value).length,0);again.resolve(fixture());await retry;assert.equal(s.current.value,null);assert.equal(s.success.value,'');h.finish();
});
test('matrix displays recorded prices with unconfirmed availability, missing offers as text, and keeps the table while editing',async()=>{
 const h=harness();await h.initialize();const s=h.state;s.comparisonMode.value='matrix';
 const response={processId:30,comparisonHash:'a'.repeat(64),suppliers:[{id:1,name:'Proveedor A'},{id:2,name:'Proveedor B'}],supplierTotals:[{supplierId:1,complete:false},{supplierId:2,complete:false}],recommendation:null,comparisonPartial:true,reason:'Disponibilidad por confirmar',selection:[],rows:[{lineId:1,product:{name:'Tejas'},unit:{name:'Unidad'},requestedQuantity:10,purchaseQuantity:10,pendingQuantity:10,wanted:10,cells:[{supplierId:1,detailId:11,state:'unconfirmed',eligible:false,label:'Disponibilidad por confirmar',unitPrice:10,currency:'USD',availableQuantity:0,quotedQuantity:10,discount:0,taxRate:0,deliveryDays:2},{supplierId:2,state:'not_quoted',eligible:false}]}]};
 s.serverComparison.value=response;const output=await html(s);assert.match(output,/Matriz de proveedores/);assert.match(output,/\$10\.00/);assert.match(output,/Disponibilidad por confirmar/);assert.match(output,/No cotizado/);assert.match(output,/Corregir oferta o disponibilidad/);assert.doesNotMatch(output,/Revisar selección<\/h2>/);
 s.selections.value[1]={detailId:11,quantity:0};assert.equal(s.serverComparison.value.processId,30,'An invalid edit must not remove the table or focused input');assert.equal(s.comparisonReady.value,false);h.finish();
});
