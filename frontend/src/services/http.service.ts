import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { activeCompanyId } from "./company-context";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 15000,
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (activeCompanyId.value && !config.headers["X-Company-Id"]) {
    config.headers["X-Company-Id"] = String(activeCompanyId.value);
  }
  return config;
});

type RetryRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _networkRetries?: number;
};

let refreshRequest: Promise<string> | null = null;

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function canRetryRequest(error: AxiosError, request: RetryRequestConfig) {
  if (request.method?.toLowerCase() !== "get" || error.code === "ERR_CANCELED") return false;

  const status = error.response?.status;
  return !status || status === 502 || status === 503 || status === 504;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryRequestConfig | undefined;

    if (!originalRequest) return Promise.reject(error);

    if (canRetryRequest(error, originalRequest) && (originalRequest._networkRetries ?? 0) < 1) {
      originalRequest._networkRetries = (originalRequest._networkRetries ?? 0) + 1;
      await wait(350);
      return http(originalRequest);
    }

    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/refresh") ||
      originalRequest?.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/logout");

    if (
      error.response?.status !== 401 ||
      isAuthEndpoint ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshRequest) {
        refreshRequest = import("../stores/auth.store")
          .then(({ useAuthStore }) => useAuthStore().refreshAccessToken())
          .finally(() => {
            refreshRequest = null;
          });
      }

      const newToken = await refreshRequest;

      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return http(originalRequest);
    } catch (refreshError) {
      const { useAuthStore } = await import("../stores/auth.store");
      const authStore = useAuthStore();
      authStore.forceLogout();

      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }

      return Promise.reject(refreshError);
    }
  },
);
