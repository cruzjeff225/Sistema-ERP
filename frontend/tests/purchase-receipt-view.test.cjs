const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {test}=require('node:test');
const root=path.resolve(__dirname,'../..'),front=createRequire(path.join(root,'frontend/package.json'));
const vue=front('vue'),ts=front('typescript'),{parse,compileScript}=front('vue/compiler-sfc');
const descriptor=parse(fs.readFileSync(path.join(root,'frontend/src/views/PurchasesView.vue'),'utf8')).descriptor;
const transpile=input=>ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const hooks=[],calls=[],effect=vue.effectScope(),cache=new Map();
function requireMock(spec){
 if(spec==='vue')return {...vue,onMounted(){},onBeforeUnmount:fn=>hooks.push(fn)};
 if(spec==='vue-router')return {useRoute:()=>vue.reactive({query:{}}),useRouter:()=>({push(){},replace(){}})};
 if(spec==='lucide-vue-next')return front(spec);
 if(spec.endsWith('.vue'))return {default:{}};
 if(spec.endsWith('/http.service'))return {http:{get:(url,config)=>new Promise(resolve=>calls.push({url,config,resolve:data=>resolve({data:{data}})}))}};
 if(spec.endsWith('/company-context'))return {activeCompanyId:vue.ref(3)};
 if(spec.endsWith('/usePermissions'))return {usePermissions:()=>({can:()=>true})};
 if(spec.endsWith('/useUnsavedChanges'))return {useUnsavedChanges:()=>({leaving:vue.ref(false),resolveLeave(){}})};
 if(spec.endsWith('/api-error'))return {getApiErrorMessage:(_,fallback)=>fallback};
 if(spec.startsWith('../utils/')||spec.startsWith('./')){const file=path.join(root,'frontend/src/utils',path.basename(spec)+'.ts');if(!cache.has(file)){const exports={};vm.runInNewContext(transpile(fs.readFileSync(file,'utf8')),{exports,require:requireMock,Intl,Date});cache.set(file,exports);}return cache.get(file);}
 throw Error(spec);
}
const exportsMock={};vm.runInNewContext(transpile(compileScript(descriptor,{id:'receipt-qa'}).content),{exports:exportsMock,require:requireMock,Intl,Date,crypto:require('node:crypto')});
const state=effect.run(()=>exportsMock.default.setup({section:'orders'},{expose(){}}));
test('receipt view permits pending placement without spaces and prevents invalid quantities',async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(new Date());
 const order={id:1,code:'OC-QA',status:'sent',orderDate:date+'T12:00:00-06:00',warehouseId:39,warehouse:{name:'General'},supplier:{name:'QA'},details:[{id:11,product:{name:'Teja QA'},unit:{name:'Unidad'},quantity:3,receivedQuantity:1}],purchases:[]};
 state.orders.value=[order];state.selectedId.value=1;
 const notSent=state.openReceive(order);calls.at(-1).resolve({...order,status:'approved'});await notSent;
 assert.equal(state.drawer.value,null);assert.match(state.errorMessage.value,/enviada al proveedor/);
 const pending=state.openReceive(order);assert.equal(calls.at(-1).config.headers['X-Company-Id'],'3');calls.at(-1).resolve(order);await pending;
 assert.equal(state.drawer.value,'receive');assert.equal(state.receiveLocations.value.length,0);
 state.receiveForm.items[0].quantity=1;state.receiveOrder();
 assert(state.receiptReview.value);assert.equal(state.receiptReview.value.payload.items[0].quantity,1);assert.equal(state.receiptReview.value.payload.items[0].locationId,undefined);assert.match(state.receiptReview.value.description,/pendientes de viñeteo y confirmación física/);
 state.receiptReview.value=null;state.receiveForm.items[0].quantity=3;state.receiveOrder();assert.equal(state.receiptReview.value,null);assert.match(state.errorMessage.value,/supera lo pendiente/);
 state.receiveForm.items[0].quantity=0;state.receiveOrder();assert.equal(state.receiptReview.value,null);
 state.receiveForm.items[0].quantity=1.2;state.receiveOrder();assert.equal(state.receiptReview.value,null);assert.match(state.errorMessage.value,/número entero/);
 // Render the actual receipt form with the component's live setup state.
 const start=descriptor.template.content.indexOf('<form v-else-if="drawer === \'receive\'"');
 assert(start>=0);const form=descriptor.template.content.slice(start,descriptor.template.content.indexOf('</form>',start)+7).replace('v-else-if="drawer === \'receive\'"','');
 const compiled=front('vue/compiler-sfc').compileTemplate({source:form,filename:'PurchaseReceiptForm.vue',id:'receipt-form',ssr:true,cssVars:[],compilerOptions:{expressionPlugins:['typescript']}});
 assert.equal(compiled.errors.length,0);const renderExports={};vm.runInNewContext(transpile(compiled.code),{exports:renderExports,require:front});
 const component=vue.defineComponent({setup:()=>({...state}),ssrRender:renderExports.ssrRender});
 const AppButton=vue.defineComponent({inheritAttrs:false,props:['disabled','type'],setup:(props,{attrs,slots})=>()=>vue.h('button',{...attrs,disabled:props.disabled,type:props.type||'button'},slots.default?.())});
 async function html(){const app=vue.createSSRApp(component);app.config.warnHandler=message=>{throw Error(message)};app.component('AppButton',AppButton);app.component('AppInput',vue.defineComponent({setup:()=>()=>vue.h('input')}));app.component('Check',vue.defineComponent({setup:()=>()=>vue.h('svg')}));return front('vue/server-renderer').renderToString(app);}
 state.receiveForm.items[0].quantity=1;const output=await html();assert.match(output,/La recepción quedará pendiente de ubicación/);assert.doesNotMatch(output.match(/<button[^>]*>Revisar recepción<\/button>/)[0],/disabled/);
 state.receiveForm.items[0].quantity=0;assert.match((await html()).match(/<button[^>]*>Revisar recepción<\/button>/)[0],/disabled/);
 hooks.forEach(fn=>fn());effect.stop();console.log(JSON.stringify({status:'PASS',checks:['receipt without spaces opens','unassigned location omitted from payload','partial quantity and physical confirmation disclosed','over-receipt and zero blocked','actual SSR review button enabled without spaces and disabled at zero'],browser:false,databaseWrites:false}));
});
