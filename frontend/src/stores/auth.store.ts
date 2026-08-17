import { defineStore } from "pinia";
import { http, setAccessToken } from "../services/http.service";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  employee?: { id: number; code: string; fullName: string };
}

interface AuthState {
  user: AuthUser | null;
  isInitializing: boolean;
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    user: null,
    isInitializing: true,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
  },

  actions: {
    async login(email: string, password: string) {
      const response = await http.post("/auth/login", { email, password });
      const { accessToken, user } = response.data.data;

      setAccessToken(accessToken);
      this.user = user;
    },

    async fetchCurrentUser() {
      const response = await http.get("/auth/me");
      this.user = response.data.data;
    },

    async refreshAccessToken(): Promise<string> {
      const response = await http.post("/auth/refresh");
      const { accessToken, user } = response.data.data;

      setAccessToken(accessToken);
      this.user = user;

      return accessToken;
    },

    async logout() {
      try {
        await http.post("/auth/logout");
      } finally {
        this.forceLogout();
      }
    },

    forceLogout() {
      setAccessToken(null);
      this.user = null;
    },

    async initialize() {
      this.isInitializing = true;
      try {
        await this.refreshAccessToken();
      } catch {
        this.forceLogout();
      } finally {
        this.isInitializing = false;
      }
    },
  },
});
