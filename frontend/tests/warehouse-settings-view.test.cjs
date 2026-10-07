const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),front=createRequire(path.join(root,'frontend/package.json'));
const vue=front('vue'),ts=front('typescript'),compiler=front('vue/compiler-sfc');
const descriptor=compiler.parse(fs.readFileSync(path.join(root,'frontend/src/views/WarehouseSettingsView.vue'),'utf8')).descriptor;
const transpile=input=>ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){
 const scope=vue.effectScope(),hooks=[],company=vue.ref(3),calls=[];
 const mock=spec=>spec==='vue'?{...vue,onBeforeUnmount:fn=>hooks.push(fn)}:spec==='vue-router'?{}:spec.endsWith('.vue')?{default:{}}:spec.endsWith('/company-context')?{activeCompanyId:company}:spec.endsWith('/usePermissions')?{usePermissions:()=>({can:p=>['warehouses.update','warehouses.view','locations.view'].includes(p)})}:spec.endsWith('/useUnsavedChanges')?{useUnsavedChanges:()=>({leaving:vue.ref(false),resolveLeave(){}})}:spec.endsWith('/api-error')?{getApiErrorMessage:(_,fallback)=>fallback}:spec.endsWith('/http.service')?{http:{get:(url,config)=>new Promise(resolve=>calls.push({url,config,resolve:data=>resolve({data:{data}})})),patch:(url,payload,config)=>new Promise(resolve=>calls.push({url,payload,config,method:'PATCH',resolve:data=>resolve({data:{data}})}))}}:(()=>{throw Error(spec)})();
 const exports={};vm.runInNewContext(transpile(compiler.compileScript(descriptor,{id:'center-qa'}).content),{exports,require:mock,Intl,Date});
 const state=scope.run(()=>exports.default.setup({}, {expose(){}}));
 return{state,calls,company,close(){hooks.forEach(fn=>fn());scope.stop()}};
}
const warehouse=(id,isActive=true)=>({id,branchId:16,isActive,name:'Almacén '+id,branch:{id:16,name:'Central',isActive:true}});
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();await vue.nextTick();}
test('center configuration loads real warehouse choices, excludes inactive ones and ignores another company response',async()=>{const qa=harness();try{
 const old=[...qa.calls];qa.company.value=4;await vue.nextTick();const current=qa.calls.slice(old.length);assert(current.every(c=>c.config.headers['X-Company-Id']==='4'));
 current.find(c=>c.url==='/supply/configuration').resolve({generalWarehouse:warehouse(82)});current.find(c=>c.url==='/warehouses').resolve([warehouse(82),warehouse(81),warehouse(99,false)]);await flush();assert.equal(qa.state.warehouseId.value,82);assert.equal(qa.state.choices.value.length,2);
 old.find(c=>c.url==='/supply/configuration').resolve({generalWarehouse:warehouse(39)});old.find(c=>c.url==='/warehouses').resolve([warehouse(39)]);await flush();assert.equal(qa.state.warehouseId.value,82);
 qa.state.warehouseId.value=81;assert.equal(qa.state.dirty.value,true);const saving=qa.state.save();const patch=qa.calls.at(-1);assert.equal(patch.method,'PATCH');assert.equal(patch.config.headers['X-Company-Id'],'4');assert.equal(patch.payload.warehouseId,81);
 qa.company.value=3;await vue.nextTick();patch.resolve({});await saving;assert.equal(qa.state.success.value,'');assert.equal(qa.state.warehouseId.value,0);
 }finally{qa.close()}});
