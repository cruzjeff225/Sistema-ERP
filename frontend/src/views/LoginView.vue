<script setup lang="ts">
import BrandLogo from '../components/base/BrandLogo.vue';
import { ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowRight, Eye, EyeOff } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth.store";
import AppInput from "../components/base/AppInput.vue";
import AppButton from "../components/base/AppButton.vue";

const router = useRouter();
const authStore = useAuthStore();
const email = ref("admin@erp.local");
const password = ref("");
const showPassword = ref(false);
const errorMessage = ref("");
const isSubmitting = ref(false);

async function handleSubmit() {
  errorMessage.value = "";
  isSubmitting.value = true;
  try {
    await authStore.login(email.value, password.value);
    router.push({ name: "dashboard" });
  } catch (error: any) {
    const message = error.response?.data?.message;
    errorMessage.value = Array.isArray(message) ? message[0] : message ?? "No se pudo iniciar sesion";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-bg px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-7 text-center">
        <BrandLogo class="mx-auto" />
        <h1 class="mt-4 text-2xl font-semibold text-fg">Bienvenido a Apex</h1>
        <p class="mt-1 text-sm text-muted-fg">Gestión empresarial, en un solo lugar</p>
      </div>

      <section class="rounded-2xl border border-border/70 bg-surface p-6 shadow-subtle sm:p-8">
        <form class="space-y-4" @submit.prevent="handleSubmit">
          <AppInput v-model="email" type="email" label="Correo electronico" autocomplete="email" required />
          <div>
            <label for="password" class="mb-1.5 block text-sm font-medium text-fg">Contrasena</label>
            <div class="relative">
              <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required class="h-10 w-full rounded-lg border border-border bg-surface px-3 pr-11 text-sm text-fg shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15" />
              <button type="button" class="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-muted-fg hover:bg-surface-secondary hover:text-fg" :title="showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'" @click="showPassword = !showPassword"><EyeOff v-if="showPassword" class="h-4 w-4" /><Eye v-else class="h-4 w-4" /></button>
            </div>
          </div>

          <p v-if="errorMessage" role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{{ errorMessage }}</p>

          <AppButton type="submit" :disabled="isSubmitting" class="w-full">
            {{ isSubmitting ? "Ingresando..." : "Iniciar sesion" }}
            <ArrowRight class="h-4 w-4" />
          </AppButton>
        </form>
      </section>
      <p class="mt-4 text-center text-xs text-muted-fg">Acceso protegido del sistema</p>
    </div>
  </main>
</template>
