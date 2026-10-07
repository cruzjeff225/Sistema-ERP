const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),front=createRequire(path.join(root,'frontend/package.json')),vue=front('vue'),ts=front('typescript'),compiler=front('vue/compiler-sfc');
const descriptor=compiler.parse(fs.readFileSync(path.join(root,'frontend/src/views/TrashView.vue'),'utf8')).descriptor;
const code=ts.transpileModule(compiler.compileScript(descriptor,{id:'trash-qa'}).content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function settle(){for(let n=0;n<8;n++){await Promise.resolve();await vue.nextTick();}}
function harness(allowed=true){const company=vue.ref(3),calls=[],hooks=[],effect=vue.effectScope();
 const http=Object.fromEntries(['get','post'].map(method=>[method,(url,...args)=>new Promise((resolve,reject)=>calls.push({method,url,body:method==='post'?args[0]:undefined,config:args[method==='post'?1:0],resolve:data=>resolve({data:{data}}),reject}))]));
 function requireMock(spec){if(spec==='vue')return{...vue,onBeforeUnmount:fn=>hooks.push(fn)};if(spec==='lucide-vue-next')return front(spec);if(spec.endsWith('.vue'))return{default:{}};if(spec.endsWith('/http.service'))return{http};if(spec.endsWith('/company-context'))return{activeCompanyId:company};if(spec.endsWith('/usePermissions'))return{usePermissions:()=>({can:p=>allowed||p!=='trash.purge'})};if(spec.endsWith('/api-error'))return{getApiErrorMessage:(_e,f)=>f};throw Error(spec);}
 const exports={};vm.runInNewContext(code,{exports,require:requireMock,Intl,Date,setTimeout:()=>0,clearTimeout(){}});const state=effect.run(()=>exports.default.setup({},{expose(){}}));
 return{state,calls,company,async initialize(){calls[0].resolve([]);await settle();calls.at(-1).resolve({items:[{id:1,label:'Uno'},{id:2,label:'Dos'}],total:2,pages:1});await settle();},finish(){hooks.forEach(fn=>fn());effect.stop();}};
}
test('empty trash previews all company IDs and only deletes that snapshot after confirmation',async()=>{const h=harness();await h.initialize();try{
 const preparing=h.state.preparePurge();assert.equal(h.calls.at(-1).url,'/trash/purge-preview');h.calls.at(-1).resolve({ids:[1,2,3],count:3});await preparing;
 assert(!h.calls.some(c=>c.method==='post'));h.state.rows.value.push({id:4,label:'Agregado después'});
 const work=h.state.purge(),request=h.calls.at(-1);assert.equal(request.url,'/trash/purge');assert.deepEqual(Array.from(request.body.ids),[1,2,3]);assert.equal(request.body.confirmed,true);
 request.resolve({processed:3,removed:2,retained:1});await settle();h.calls.at(-1).resolve({items:[{id:4,label:'Agregado después'}],total:1,pages:1});await work;assert.match(h.state.success.value,/referencias históricas/);
 }finally{h.finish();}});
test('permanent removal permission and company changes prevent an unintended request',async()=>{const restricted=harness(false);await restricted.initialize();try{const before=restricted.calls.length;await restricted.state.preparePurge({id:1,label:'Uno'});assert.equal(restricted.calls.length,before);assert.equal(restricted.state.purgeSelection.value,null);}finally{restricted.finish();}
 const h=harness();await h.initialize();try{await h.state.preparePurge({id:1,label:'Uno'});h.company.value=4;await settle();assert.equal(h.state.purgeSelection.value,null);await h.state.purge();assert(!h.calls.some(c=>c.method==='post'));}finally{h.finish();}
});
