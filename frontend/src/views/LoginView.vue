<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.store';
import AppInput from '../components/base/AppInput.vue';
import AppButton from '../components/base/AppButton.vue';
import AppCard from '../components/base/AppCard.vue';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

async function handleSubmit() {
    errorMessage.value = '';
    isSubmitting.value = true;

    try {
        await authStore.login(email.value, password.value);
        router.push({ name: 'dashboard' });
    } catch (error: any) {
        errorMessage.value =
            error.response?.data?.message ?? 'No se pudo iniciar sesión';
    } finally {
        isSubmitting.value = false;
    }
}
</script>

<template>
    <div class="flex min-h-screen items-center justify-center bg-bg px-4">
        <div class="w-full max-w-sm">
            <div class="mb-8 flex flex-col items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-fg text-bg">
                    <span class="text-sm font-bold">E</span>
                </div>
                <div class="text-center">
                    <p class="text-base font-semibold text-fg">ERP Software</p>
                    <p class="text-sm text-muted-fg">Inicia sesión para continuar</p>
                </div>
            </div>

            <AppCard>
                <form class="space-y-4" @submit.prevent="handleSubmit">
                    <AppInput v-model="email" type="email" label="Correo electrónico" placeholder="admin@erp.local"
                        autocomplete="email" />
                    <AppInput v-model="password" type="password" label="Contraseña" placeholder="••••••••"
                        autocomplete="current-password" />

                    <p v-if="errorMessage" class="text-sm text-danger">
                        {{ errorMessage }}
                    </p>

                    <AppButton type="submit" :disabled="isSubmitting" class="w-full">
                        {{ isSubmitting ? 'Ingresando...' : 'Iniciar sesión' }}
                    </AppButton>
                </form>
            </AppCard>
        </div>
    </div>
</template>