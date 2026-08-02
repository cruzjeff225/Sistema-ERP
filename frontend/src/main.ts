import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { useThemeStore } from "./stores/theme.store";
import { useAuthStore } from "./stores/auth.store";
import "./assets/styles/main.css";

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);

  useThemeStore().init();
  await useAuthStore().initialize();

  app.use(router);
  app.mount("#app");
}

bootstrap();
