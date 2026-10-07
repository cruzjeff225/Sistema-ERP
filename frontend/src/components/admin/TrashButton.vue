<script setup lang="ts">
import { ref, watch } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import AppButton from '../base/AppButton.vue';
import PurchaseActionDialog from '../base/PurchaseActionDialog.vue';
import { http } from '../../services/http.service';
import { activeCompanyId } from '../../services/company-context';
import { usePermissions } from '../../composables/usePermissions';
import { getApiErrorMessage } from '../../utils/api-error';
const props=defineProps<{entity:string;recordId:number;label:string;disabled?:boolean;compact?:boolean}>();
const emit=defineEmits<{deleted:[]}>();const {can}=usePermissions();const confirm=ref(false),busy=ref(false),error=ref('');
watch([activeCompanyId,()=>props.recordId],()=>{confirm.value=false;error.value='';});
async function remove(){if(busy.value)return;busy.value=true;const company=activeCompanyId.value;try{await http.delete('/trash/'+props.entity+'/'+props.recordId,{headers:{'X-Company-Id':String(company)}});if(company!==activeCompanyId.value)return;confirm.value=false;emit('deleted');}catch(e){error.value=getApiErrorMessage(e,'No se pudo enviar a la papelera');}finally{busy.value=false;}}
</script>
<template><AppButton v-if="can('trash.delete')" variant="ghost" :disabled="disabled || busy" @click="confirm=true;error=''" class="text-danger" :title="compact ? 'Enviar a papelera' : undefined" :aria-label="compact ? 'Enviar a papelera: ' + label : undefined"><Trash2 class="h-4 w-4"/><span v-if="!compact">Enviar a papelera</span></AppButton><PurchaseActionDialog v-if="confirm" title="Enviar a la papelera" :description="label + ': se retirará de la gestión y podrá restaurarse durante 30 días. Se conservan los movimientos y las relaciones históricas.'" :busy="busy" :error="error" @close="confirm=false" @confirm="remove" /></template>
