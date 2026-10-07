const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),front=createRequire(path.join(root,'frontend/package.json'));
const vue=front('vue'),ts=front('typescript'),compiler=front('vue/compiler-sfc');
const descriptor=compiler.parse(fs.readFileSync(path.join(root,'frontend/src/views/WarehouseOperationsView.vue'),'utf8')).descriptor;
const transpile=input=>ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function harness(query={},permissions=null){
 const scope=vue.effectScope(),hooks=[],calls=[],cache=new Map(),route=vue.reactive({query,fullPath:'/inventory/warehouse'});
 const receipt=id=>({id,documentNumber:'RC-'+id,status:'RECEIVED',supplier:{name:'Proveedor '+id},purchaseOrder:{expenses:[]},retaceos:[],currency:'USD'});
 const general={id:39,branchId:16,name:'Almacén general',branch:{id:16,name:'Central'},locations:[{id:99,code:'CENTRAL-01'}]};
 const pending=[10,20].map(id=>({id:id+40,purchaseId:id,purchase:{...receipt(id),warehouse:general},product:{id,internalCode:'PRD-'+id,name:'Producto '+id,sku:'RF-'+id},unit:{name:'Pieza'},quantity:10}));
 function mock(spec){
  if(spec==='vue')return {...vue,onBeforeUnmount:fn=>hooks.push(fn)};
  if(spec==='vue-router')return {useRoute:()=>route,RouterLink:vue.defineComponent({props:['to'],setup:(p,{slots})=>()=>vue.h('a',{href:typeof p.to==='string'?p.to:p.to.path+'?tab='+p.to.query?.tab},slots.default?.())})};
  if(spec==='jsbarcode')return {default:()=>{}};
  if(spec==='lucide-vue-next')return front(spec);
  if(spec.endsWith('.vue'))return {default:{}};
  if(spec.endsWith('/http.service'))return {http:{get:async(url,config)=>{calls.push(url);const data=url==='/supply/placements'?pending:url==='/inventory/catalogs'?{warehouses:[general],generalWarehouse:general}:url==='/purchase-catalogs'?{expenseTypes:[],generalWarehouse:general}:url.startsWith('/purchases?')?{items:[receipt(10),receipt(20)]}:url==='/supply/requests'||url==='/supply/transfers'||url.includes('/expenses')?[]:url.startsWith('/inventory/stocks')?{items:[],totalPages:0}:url.startsWith('/purchases/')?receipt(Number(url.split('/').at(-1))):[];return {data:{data}};}}};
  if(spec.endsWith('/company-context'))return {activeCompanyId:vue.ref(3)};
  if(spec.endsWith('/usePermissions'))return {usePermissions:()=>({can:p=>!permissions||permissions.includes(p)})};
  if(spec.endsWith('/useUnsavedChanges'))return {useUnsavedChanges:()=>({leaving:vue.ref(false),resolveLeave(){}})};
  if(spec.endsWith('/api-error'))return {getApiErrorMessage:(_,fallback)=>fallback};
  if(spec.startsWith('../utils/')||spec.startsWith('./')){const file=path.join(root,'frontend/src/utils',path.basename(spec)+'.ts');if(!cache.has(file)){const exports={};vm.runInNewContext(transpile(fs.readFileSync(file,'utf8')),{exports,require:mock,Intl,Date});cache.set(file,exports);}return cache.get(file);}
  throw Error(spec);
 }
 const exports={};vm.runInNewContext(transpile(compiler.compileScript(descriptor,{id:'bodega-qa'}).content),{exports,require:mock,Intl,Date,crypto:require('node:crypto')});
 const state=scope.run(()=>exports.default.setup({}, {expose(){}}));
 for(let i=0;i<8;i++)await Promise.resolve();await vue.nextTick();
 async function html(){const code=compiler.compileTemplate({source:descriptor.template.content,filename:'WarehouseOperations.vue',id:'bodega-template',ssr:true,cssVars:[],compilerOptions:{expressionPlugins:['typescript']}});assert.equal(code.errors.length,0);const rendered={};vm.runInNewContext(transpile(code.code),{exports:rendered,require:front});const app=vue.createSSRApp(vue.defineComponent({setup:()=>({...state}),ssrRender:rendered.ssrRender}));app.config.warnHandler=m=>{throw Error(m)};
 app.component('AdminLayout',vue.defineComponent({setup:(_,ctx)=>()=>vue.h('main',ctx.slots.default?.())}));app.component('PurchaseActionDialog',vue.defineComponent({setup:()=>()=>vue.h('dialog')}));app.component('OperationsNav',vue.defineComponent({setup:()=>()=>vue.h('nav')}));app.component('RouterLink',mock('vue-router').RouterLink);app.component('AppButton',vue.defineComponent({setup:(_,ctx)=>()=>vue.h('button',ctx.attrs,ctx.slots.default?.())}));
 for(const name of ['ArrowLeft','ArrowRight','ScanLine','Truck','ReceiptText','RefreshCw'])app.component(name,front('lucide-vue-next')[name]);return front('vue/server-renderer').renderToString(app);}
 return {state,calls,html,close(){hooks.forEach(f=>f());scope.stop()}};
}
test('bodega starts with two clear physical tasks and keeps configuration and financial forms out of its home',async()=>{const qa=await harness();try{assert.equal(qa.state.tab.value,'home');const html=await qa.html();assert.match(html,/Ubicar productos/);assert.match(html,/Trasladar a sucursales/);assert.match(html,/Gastos de recepción/);assert.doesNotMatch(html,/Guardar centro general|Centro general de almacenaje|Leer código de barras colocado|Tipo de gasto/);assert(!qa.calls.some(url=>url.startsWith('/purchases?')||url==='/purchase-catalogs'||url==='/supply/requests'));}finally{qa.close()}});
test('receipt links still open placement directly and expose only the linked receipt',async()=>{const qa=await harness({purchaseId:'10'});try{assert.equal(qa.state.tab.value,'placement');const html=await qa.html();assert.match(html,/Producto 10/);assert.doesNotMatch(html,/Producto 20|Trasladar a sucursales/);assert.equal(qa.state.taskLink('expenses').query.purchaseId,'10');assert(qa.calls.some(url=>url.startsWith('/purchases?')));}finally{qa.close()}});
test('expense links open the real expense task while unsupported tabs and read-only permissions retain a safe home',async()=>{const expenses=await harness({tab:'expenses'});try{assert.equal(expenses.state.tab.value,'expenses');assert.match(await expenses.html(),/Gastos reales de la recepción/);assert(expenses.calls.includes('/purchase-catalogs'));}finally{expenses.close()}
 const restricted=await harness({tab:'expenses'},['inventory.view']);try{assert.equal(restricted.state.tab.value,'home');const html=await restricted.html();assert.match(html,/Trasladar a sucursales/);assert.doesNotMatch(html,/Ubicar productos|Gastos de recepción/);}finally{restricted.close()}
});
