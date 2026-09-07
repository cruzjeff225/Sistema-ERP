import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { useThemeStore } from "./stores/theme.store";
import { useAuthStore } from "./stores/auth.store";
import { useFeedbackStore } from "./stores/feedback.store";
import "./assets/styles/main.css";

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();
  const feedback = useFeedbackStore(pinia);

  app.config.errorHandler = (error, _instance, info) => {
    console.error(`Error de interfaz (${info})`, error);
    feedback.error("No se pudo completar esa acción. Puedes intentarlo nuevamente.");
  };

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Operación sin controlar", event.reason);
    feedback.error("La operación no se pudo completar. La pantalla sigue disponible para continuar.");
  });

  app.use(pinia);

  useThemeStore().init();
  await useAuthStore().initialize();

  app.use(router);
  app.mount("#app");
}

bootstrap().catch((error) => {
  console.error("No fue posible iniciar la aplicación", error);
  const root = document.querySelector("#app");
  if (root) {
    root.innerHTML = '<main style="display:grid;min-height:100vh;place-items:center;padding:24px;font-family:system-ui,sans-serif"><section style="max-width:440px;text-align:center"><h1 style="font-size:20px">No se pudo iniciar el sistema</h1><p style="color:#64748b">Actualiza la página. Si el problema continúa, verifica que el servidor esté disponible.</p></section></main>';
  }
});
