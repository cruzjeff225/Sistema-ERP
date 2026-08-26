<script setup lang="ts">
import { computed } from "vue";

type District = { id: number; name: string };
type Municipality = { id: number; name: string; districts: District[] };
type Department = { id: number; name: string; municipalities: Municipality[] };

const props = defineProps<{
  departments: Department[];
  departmentId: string;
  municipalityId: string;
  districtId: string;
}>();

const emit = defineEmits<{
  "update:departmentId": [value: string];
  "update:municipalityId": [value: string];
  "update:districtId": [value: string];
}>();

const municipalities = computed(() =>
  props.departments.find((department) => String(department.id) === props.departmentId)?.municipalities ?? [],
);
const districts = computed(() =>
  municipalities.value.find((municipality) => String(municipality.id) === props.municipalityId)?.districts ?? [],
);

function onDepartmentChange(event: Event) {
  emit("update:departmentId", (event.target as HTMLSelectElement).value);
  emit("update:municipalityId", "");
  emit("update:districtId", "");
}

function onMunicipalityChange(event: Event) {
  emit("update:municipalityId", (event.target as HTMLSelectElement).value);
  emit("update:districtId", "");
}
</script>

<template>
  <div class="contents">
    <label class="text-sm font-medium text-fg">
      Departamento
      <select :value="departmentId" required class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg" @change="onDepartmentChange">
        <option value="" disabled>Seleccione un departamento</option>
        <option v-for="department in departments" :key="department.id" :value="String(department.id)">{{ department.name }}</option>
      </select>
    </label>
    <label class="text-sm font-medium text-fg">
      Municipio
      <select :value="municipalityId" required :disabled="!departmentId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg disabled:cursor-not-allowed disabled:bg-surface-secondary" @change="onMunicipalityChange">
        <option value="" disabled>Seleccione un municipio</option>
        <option v-for="municipality in municipalities" :key="municipality.id" :value="String(municipality.id)">{{ municipality.name }}</option>
      </select>
    </label>
    <label class="text-sm font-medium text-fg">
      Distrito
      <select :value="districtId" required :disabled="!municipalityId" class="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg disabled:cursor-not-allowed disabled:bg-surface-secondary" @change="emit('update:districtId', ($event.target as HTMLSelectElement).value)">
        <option value="" disabled>Seleccione un distrito</option>
        <option v-for="district in districts" :key="district.id" :value="String(district.id)">{{ district.name }}</option>
      </select>
    </label>
  </div>
</template>
