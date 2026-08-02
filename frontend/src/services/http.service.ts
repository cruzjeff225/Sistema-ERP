import axios, { type InternalAxiosRequestConfig } from "axios";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

type QueueItem = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let refreshQueue: QueueItem[] = [];

function resolveQueue(token: string) {
  refreshQueue.forEach((item) => item.resolve(token));
  refreshQueue = [];
}

function rejectQueue(error: unknown) {
  refreshQueue.forEach((item) => item.reject(error));
  refreshQueue = [];
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/refresh") ||
      originalRequest?.url?.includes("/auth/login");

    if (
      error.response?.status !== 401 ||
      isAuthEndpoint ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(http(originalRequest));
          },
          reject,
        });
      });
    }

    isRefreshing = true;

    try {
      const { useAuthStore } = await import("../stores/auth.store");
      const authStore = useAuthStore();
      const newToken = await authStore.refreshAccessToken();

      isRefreshing = false;
      resolveQueue(newToken);

      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return http(originalRequest);
    } catch (refreshError) {
      isRefreshing = false;
      rejectQueue(refreshError);

      const { useAuthStore } = await import("../stores/auth.store");
      const authStore = useAuthStore();
      authStore.forceLogout();

      return Promise.reject(refreshError);
    }
  },
);
