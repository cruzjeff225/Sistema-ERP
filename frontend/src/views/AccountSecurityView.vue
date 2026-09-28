<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { KeyRound } from "lucide-vue-next";
import AdminLayout from "../layouts/AdminLayout.vue";
import AppInput from "../components/base/AppInput.vue";
import AppButton from "../components/base/AppButton.vue";
import { http } from "../services/http.service";
import { useAuthStore } from "../stores/auth.store";
import { useFeedbackStore } from "../stores/feedback.store";
import { getApiErrorMessage } from "../utils/api-error";

const form = reactive({ currentPassword: "", newPassword: "", confirmation: "" });
const saving = ref(false);
const errorMessage = ref("");
const auth = useAuthStore();
const router = useRouter();
async function save() {
  if (saving.value) return;
  errorMessage.value = "";
  if (form.newPassword !== form.confirmation) { errorMessage.value = "Las contrasenas nuevas no coinciden"; return; }
  saving.value = true;
  try {
    await http.patch("/auth/password", { currentPassword: form.currentPassword, newPassword: form.newPassword });
    form.currentPassword = form.newPassword = form.confirmation = "";
    auth.forceLogout();
    useFeedbackStore().success("Contrasena actualizada. Inicia sesion con tu nueva clave.");
    await router.replace("/login");
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "No se pudo cambiar la contrasena"); }
  finally { saving.value = false; }
}
</script>

<template>
  <AdminLayout title="Seguridad de mi cuenta">
    <h1 class="page-title">Cambiar contrasena</h1>
    <p class="mt-2 text-sm text-muted-fg">{{ auth.user?.email }}</p>
    <form class="mt-8 max-w-lg" @submit.prevent="save">
      <fieldset :disabled="saving" class="space-y-5">
        <AppInput v-model="form.currentPassword" type="password" autocomplete="current-password" label="Contrasena actual" required maxlength="128" />
        <AppInput v-model="form.newPassword" type="password" autocomplete="new-password" label="Nueva contrasena" required minlength="12" maxlength="128" />
        <AppInput v-model="form.confirmation" type="password" autocomplete="new-password" label="Confirmar nueva contrasena" required minlength="12" maxlength="128" />
        <p v-if="errorMessage" role="alert" class="text-sm text-danger">{{ errorMessage }}</p>
        <AppButton type="submit"><KeyRound class="h-4 w-4" />{{ saving ? 'Actualizando...' : 'Actualizar contrasena' }}</AppButton>
      </fieldset>
    </form>
  </AdminLayout>
</template>
