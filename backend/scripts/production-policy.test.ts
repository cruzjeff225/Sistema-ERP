import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import { validate } from '../src/config/env.validation';
import { runtimePolicy } from '../src/config/runtime-policy';
import { HealthController } from '../src/health.controller';

const valid={NODE_ENV:'production',PORT:'3000',DATABASE_URL:'postgresql://app:password@db:5432/erp',FRONTEND_URL:'https://erp.company.com',JWT_ACCESS_SECRET:'a84f1c27'.repeat(8),JWT_REFRESH_SECRET:'9360bc72'.repeat(8),JWT_ACCESS_EXPIRES_IN:'15m',JWT_REFRESH_EXPIRES_IN:'7d',TRUST_PROXY_HOPS:'2'};
test('production rejects local/insecure origins, placeholders, weak/equal secrets and invalid proxy depth',()=>{
  assert.equal(validate(valid).TRUST_PROXY_HOPS,2);
  for(const change of [{FRONTEND_URL:'http://erp.company.com'},{FRONTEND_URL:'https://localhost'},{FRONTEND_URL:'https://erp.local'},{FRONTEND_URL:'https://erp.company.com/path'},{JWT_ACCESS_SECRET:'short'},{JWT_ACCESS_SECRET:'CHANGE_ME_'.repeat(8)},{JWT_ACCESS_SECRET:valid.JWT_REFRESH_SECRET},{TRUST_PROXY_HOPS:'4'},{PORT:'70000'},{PORT:'3000.5'},{DATABASE_URL:'https://database.company.com'}])assert.throws(()=>validate({...valid,...change}));
});
test('development remains compatible and production does not expose Swagger or allow localhost CORS',()=>{
 assert.equal(validate({...valid,NODE_ENV:'development',FRONTEND_URL:'http://localhost:5173',JWT_ACCESS_SECRET:'dev',JWT_REFRESH_SECRET:'dev'}).NODE_ENV,'development');
 const prod=runtimePolicy('production',valid.FRONTEND_URL,2);assert.deepEqual(prod.allowedOrigins,[valid.FRONTEND_URL]);assert.equal(prod.swaggerEnabled,false);assert.equal(prod.trustProxyHops,2);
 const dev=runtimePolicy('development','http://localhost:5173');assert(dev.allowedOrigins.includes('http://127.0.0.1:5173'));assert.equal(dev.swaggerEnabled,true);
});
test('health readiness checks the database and reports no exception details or credentials',async()=>{
 const ready=new HealthController({$queryRaw:async()=>[{value:1}]} as any);assert.deepEqual(await ready.ready(),{status:'ready'});assert.deepEqual(ready.live(),{status:'ok'});
 const failed=new HealthController({$queryRaw:async()=>{throw Error('postgres://private:password@db')}} as any);await assert.rejects(failed.ready(),(e:any)=>e.getStatus()===503&&!e.message.includes('password'));
});
