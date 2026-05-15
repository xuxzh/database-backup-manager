import { ApiError, apiRequest } from "@/api/client";

export type { ApiError };
export { apiRequest };

export function createApiRequest(token: string | null) {
  return async <T,>(path: string, options: RequestInit = {}) => {
    try {
      return await apiRequest<T>(path, { ...options, token });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        localStorage.removeItem("token");
        window.location.reload();
      }
      throw requestError;
    }
  };
}