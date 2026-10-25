import axios from "axios";

type ApiErrorBody = {
  message?: string | string[];
  errors?: Array<{ message?: string }>;
};

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return fallback;

  const validationMessage = error.response?.data?.errors?.find((item) => typeof item.message === "string" && item.message.trim())?.message;
  if (validationMessage) return validationMessage;

  const message = error.response?.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && message[0]) return String(message[0]);

  if (!error.response) {
    return "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";
  }

  if (error.response.status >= 500) {
    return "El servidor no pudo completar la operación. Inténtalo nuevamente en unos segundos.";
  }

  return fallback;
}
