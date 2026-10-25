import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AxiosError} from 'axios';
import {getApiErrorMessage} from '../src/utils/api-error';

test('specific product quantity validation is shown instead of the generic invalid-data message',()=>{
 const error=new AxiosError('Bad request','ERR_BAD_REQUEST',undefined,undefined,{status:400,statusText:'Bad Request',headers:{},config:{} as any,data:{message:'Los datos enviados no son válidos',errors:[{field:'details.0.quantity',message:'details.0.La cantidad de productos debe ser un número entero'}]}});
 assert.equal(getApiErrorMessage(error,'No se pudo guardar'),'details.0.La cantidad de productos debe ser un número entero');
});

test('a conflict without field validation keeps the business explanation',()=>{
 const error=new AxiosError('Conflict','ERR_BAD_REQUEST',undefined,undefined,{status:409,statusText:'Conflict',headers:{},config:{} as any,data:{message:'La orden ya está aprobada'}});
 assert.equal(getApiErrorMessage(error,'No se pudo guardar'),'La orden ya está aprobada');
});
