import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {plainToInstance} from 'class-transformer';
import {validateSync} from 'class-validator';
import {PurgeTrashDto} from '../src/modules/trash/trash.dto';
import {TrashService} from '../src/modules/trash/trash.service';
import {TrashController} from '../src/modules/trash/trash.controller';
import {PERMISSIONS_KEY} from '../src/common/decorators/permissions.decorator';

test('permanent removal requires explicit confirmation, unique positive IDs and a bounded batch',()=>{
 for(const body of [{ids:[1],confirmed:false},{ids:[1,1],confirmed:true},{ids:[-1],confirmed:true},{ids:[],confirmed:true},{ids:Array.from({length:1001},(_,i)=>i+1),confirmed:true}])assert(validateSync(plainToInstance(PurgeTrashDto,body)).length);
 assert.equal(validateSync(plainToInstance(PurgeTrashDto,{ids:[1,2],confirmed:true})).length,0);
});

test('purge refuses an unconfirmed operation before any database access',async()=>{
 await assert.rejects(new TrashService({} as any,{} as any).purge([1],3,1,false),(error:any)=>error.getStatus()===400);
});

test('purge operations require their own permission, independently of recoverable deletion',()=>{
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,TrashController.prototype.purge),['trash.purge']);
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,TrashController.prototype.purgePreview),['trash.purge']);
});
