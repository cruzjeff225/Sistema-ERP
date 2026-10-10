const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),front=createRequire(path.join(root,'frontend/package.json'));
const vue=front('vue'),ts=front('typescript'),compiler=front('vue/compiler-sfc');
const descriptor=compiler.parse(fs.readFileSync(path.join(root,'frontend/src/views/PurchasesView.vue'),'utf8')).descriptor;
const transpile=input=>ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(permissions,section='orders'){
 const scope=vue.effectScope(),hooks=[],calls=[],routes=[],cache=new Map();
 function mock(spec){
  if(spec==='vue')return {...vue,onMounted(){},onBeforeUnmount:fn=>hooks.push(fn)};
  if(spec==='vue-router')return {useRoute:()=>vue.reactive({query:{}}),useRouter:()=>({push:route=>routes.push(route),replace(){}})};
  if(spec==='lucide-vue-next')return front(spec);
  if(spec.endsWith('.vue'))return {default:{}};
  if(spec.endsWith('/http.service'))return {http:{get:async url=>{calls.push(url);throw Error('Unexpected quotation permission dependency')}}};
  if(spec.endsWith('/company-context'))return {activeCompanyId:vue.ref(3)};
  if(spec.endsWith('/usePermissions'))return {usePermissions:()=>({can:p=>permissions.includes(p)})};
  if(spec.endsWith('/useUnsavedChanges'))return {useUnsavedChanges:()=>({leaving:vue.ref(false),resolveLeave(){}})};
  if(spec.endsWith('/feedback.store'))return {useFeedbackStore:()=>({success(){},error(){},notify(){}})};
  if(spec.endsWith('/api-error'))return {getApiErrorMessage:(_,fallback)=>fallback};
  if(spec.startsWith('../utils/')||spec.startsWith('./')){const file=path.join(root,'frontend/src/utils',path.basename(spec)+'.ts');if(!cache.has(file)){const exports={};vm.runInNewContext(transpile(fs.readFileSync(file,'utf8')),{exports,require:mock,Intl,Date});cache.set(file,exports);}return cache.get(file);}
  throw Error(spec);
 }
 const exports={};vm.runInNewContext(transpile(compiler.compileScript(descriptor,{id:'management-qa'}).content),{exports,require:mock,Intl,Date,crypto:require('node:crypto')});
 const state=scope.run(()=>exports.default.setup({section},{expose(){}}));
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(new Date());
 const order={id:1,code:'OC-QA',status:'pending_approval',orderDate:day+'T12:00:00-06:00',expectedDate:day,quotationId:7,consolidationId:1,branchId:16,warehouseId:39,currency:'USD',supplier:{name:'QA'},quotation:{id:7,code:'COT-QA',currency:'USD',subtotal:200,expenses:[{expenseTypeId:1,amount:50,chargeMode:'proportional'}]},details:[{id:11,quotationDetailId:8,product:{name:'Teja QA'},unit:{name:'Unidad'},quantity:10,unitPrice:2,discount:0,subtotal:20,taxRate:0,taxAmount:0,receivedQuantity:0}],expenses:[{id:12,expenseTypeId:1,description:'',amount:5,documents:[]}],purchases:[]};
 state.catalogs.value.branches=[{id:16,warehouses:[{id:39}]}];state.orders.value=[order];state.selectedId.value=1;
 return {state,order,calls,routes,close(){hooks.forEach(f=>f());scope.stop()}};
}
async function render(state,source){
 const code=compiler.compileTemplate({source,filename:'ManagementReview.vue',id:'management-ui',ssr:true,cssVars:[],compilerOptions:{expressionPlugins:['typescript']}});assert.equal(code.errors.length,0);
 const exports={};vm.runInNewContext(transpile(code.code),{exports,require:front});const app=vue.createSSRApp(vue.defineComponent({setup:()=>({...state}),ssrRender:exports.ssrRender}));app.config.warnHandler=message=>{throw Error(message)};
 app.component('AppButton',vue.defineComponent({inheritAttrs:false,props:['disabled','type'],setup:(props,{attrs,slots})=>()=>vue.h('button',{...attrs,disabled:props.disabled,type:props.type||'button'},slots.default?.())}));
 for(const name of ['Pencil','AppInput','Plus','Trash2'])app.component(name,vue.defineComponent({setup:()=>()=>vue.h('span')}));
 return front('vue/server-renderer').renderToString(app);
}
test('Gerencia cannot edit a pending or approved final purchase; corrections require return',async()=>{
 const qa=setup(['purchase_orders.view','purchase_orders.update','purchase_orders.approve']);try{
  await vue.nextTick();assert.equal(qa.state.canEditOrder.value,false);
  await qa.state.editOrder(qa.order);assert.equal(qa.calls.length,0);assert.equal(qa.state.drawer.value,null);assert.match(qa.state.errorMessage.value,/devolver/);
  qa.state.orders.value[0].status='returned';await vue.nextTick();assert.equal(qa.state.canEditOrder.value,true);
  await qa.state.editOrder(qa.order);assert.equal(qa.state.drawer.value,'order');assert.equal(qa.state.orderForm.managementReview,false);
  qa.state.orderForm.details[0].quantity=8;assert.equal(qa.state.orderEditTotals.value.subtotal,16);assert.equal(qa.state.orderEditTotals.value.expenses,4);assert.equal(qa.state.orderEditTotals.value.total,20);
  const start=descriptor.template.content.indexOf(`<form v-else-if="drawer === 'order'"`);const form=descriptor.template.content.slice(start,descriptor.template.content.indexOf('</form>',start)+7).replace(`v-else-if="drawer === 'order'"`,'');
  const html=await render(qa.state,form);assert.match(html,/Guardar cambios/);assert.doesNotMatch(html,/Puede aumentar las cantidades aquí/);assert.match(html,/cantidades no pueden superar lo autorizado/);
 }finally{qa.close()}
});

test('purchase editing is limited to drafts and returned orders regardless of management permission',async()=>{
 for(const permissions of [['purchase_orders.approve'],['purchase_orders.update'],['purchase_orders.approve','purchase_orders.update']]){
  const qa=setup(permissions);try{await vue.nextTick();for(const status of ['pending_approval','approved','sent','received']){qa.state.orders.value[0].status=status;assert.equal(qa.state.canEditOrder.value,false);}qa.state.orders.value[0].status='returned';assert.equal(qa.state.canEditOrder.value,permissions.includes('purchase_orders.update'));const start=descriptor.template.content.indexOf('<AppButton v-if="canEditOrder"');const button=descriptor.template.content.slice(start,descriptor.template.content.indexOf('</AppButton>',start)+12);const html=await render(qa.state,button);assert.equal(html.includes('Corregir orden'),permissions.includes('purchase_orders.update'));}finally{qa.close()}
 }
});


test('returned orders stay pending and lead to observations before explicit resubmission',async()=>{
 const qa=setup(['purchase_orders.view','purchase_orders.update']);try{
  qa.order.status='returned';qa.order.reviewNotes='Ajustar la fecha de entrega';qa.order.expectedDate=null;
  qa.state.pendingOnly.value=true;await vue.nextTick();
  assert.equal(qa.state.filteredRecords.value.length,1);
  assert.equal(qa.state.nextAction.value.label,'Revisar observaciones');
  qa.state.nextAction.value.run();assert.equal(qa.state.detailView.value,'approval');assert.equal(qa.state.pendingAction.value,null);
  await qa.state.editOrder(qa.order);assert.equal(qa.state.drawer.value,'order');assert.equal(qa.state.orderForm.expectedDate,'');
  const start=descriptor.template.content.indexOf(`<div v-if="selected.status==='returned'&&can('purchase_orders.update')"`);
  const source=descriptor.template.content.slice(start,descriptor.template.content.indexOf('</div>',start)+6);
  const html=await render(qa.state,source);assert.match(html,/Enviar corrección a Gerencia/);assert.match(html,/Corregir orden/);
 }finally{qa.close()}
});

test('actions never render an empty management menu and rejected orders can be cancelled',async()=>{
 const qa=setup(['purchase_orders.view','purchase_orders.update']);try{
  await vue.nextTick();assert.equal(qa.state.secondaryActions.value,false);
  qa.order.status='approved';assert.equal(qa.state.secondaryActions.value,false);
 }finally{qa.close()}
 const qaCancel=setup(['purchase_orders.view','purchase_orders.cancel']);try{
  qaCancel.order.status='rejected';await vue.nextTick();assert.equal(qaCancel.state.secondaryActions.value,true);
  const start=descriptor.template.content.indexOf('<AppButton v-if="(props.section');
  const source=descriptor.template.content.slice(start,descriptor.template.content.indexOf('</AppButton>',start)+12);
  const html=await render(qaCancel.state,source.replace('<XCircle class="h-4 w-4" />',''));assert.match(html,/Cancelar documento/);
 }finally{qaCancel.close()}
});

test('quotation completion and editing open the exact supplier offer',async()=>{
 const qa=setup(['purchase_quotations.view','purchase_quotations.update'],'quotations');try{
  const quote={id:7,code:'COT-QA',status:'draft',quotationDate:qa.order.orderDate,validUntil:'2099-10-30',supplier:{name:'Proveedor'},rfq:{id:23,consolidationId:5},details:[]};
  qa.state.quotations.value=[quote];qa.state.selectedId.value=quote.id;await vue.nextTick();
  qa.state.nextAction.value.run();assert.equal(qa.routes.at(-1).query.id,'5');assert.equal(qa.routes.at(-1).query.rfqId,'23');
  qa.state.editQuotation(quote);assert.equal(qa.routes.at(-1).query.rfqId,'23');
 }finally{qa.close()}
});
