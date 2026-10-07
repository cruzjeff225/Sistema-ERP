<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, KeyRound } from "lucide-vue-next";
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
  if (form.newPassword !== form.confirmation) { errorMessage.value = "Las contraseñas nuevas no coinciden"; return; }
  saving.value = true;
  try {
    await http.patch("/auth/password", { currentPassword: form.currentPassword, newPassword: form.newPassword });
    form.currentPassword = form.newPassword = form.confirmation = "";
    auth.forceLogout();
    useFeedbackStore().success("Contraseña actualizada. Inicia sesión con tu nueva clave.");
    await router.replace("/login");
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "No se pudo cambiar la contraseña"); }
  finally { saving.value = false; }
}
</script>

<template>
  <AdminLayout title="Seguridad de mi cuenta">
    <div class="mx-auto max-w-5xl">
      <nav aria-label="Navegación de mi cuenta" class="mb-6 border-b border-border/70 pb-4">
        <RouterLink to="/dashboard" class="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-muted-fg hover:bg-surface-secondary hover:text-fg"><ArrowLeft class="h-4 w-4" aria-hidden="true" />Inicio</RouterLink>
      </nav>
      <header class="mb-8 sm:mb-10"><h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Seguridad de mi cuenta</h1><p class="mt-3 text-sm leading-6 text-muted-fg">Actualiza la contraseña de tu cuenta.</p></header>
      <section class="max-w-xl overflow-hidden rounded-2xl border border-border bg-surface">
        <header class="flex items-center gap-4 border-b border-border/70 px-5 py-5 sm:px-6"><span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-secondary"><KeyRound class="h-5 w-5" :stroke-width="1.6" aria-hidden="true" /></span><div class="min-w-0"><h2 class="text-sm font-semibold">Cambiar contraseña</h2><p class="mt-1 break-words text-sm text-muted-fg">{{ auth.user?.email }}</p></div></header>
        <form class="p-5 sm:p-6" @submit.prevent="save">
          <fieldset :disabled="saving" class="space-y-5">
            <AppInput v-model="form.currentPassword" type="password" autocomplete="current-password" label="Contraseña actual" required maxlength="128" />
            <AppInput v-model="form.newPassword" type="password" autocomplete="new-password" label="Nueva contraseña" required minlength="12" maxlength="128" />
            <AppInput v-model="form.confirmation" type="password" autocomplete="new-password" label="Confirmar nueva contraseña" required minlength="12" maxlength="128" />
            <p v-if="errorMessage" role="alert" class="text-sm text-danger">{{ errorMessage }}</p>
            <AppButton type="submit"><KeyRound class="h-4 w-4" />{{ saving ? 'Actualizando…' : 'Actualizar contraseña' }}</AppButton>
          </fieldset>
        </form>
      </section>
    </div>
  </AdminLayout>
</template>
