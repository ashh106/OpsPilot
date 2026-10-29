import { ApiErrorResponse } from "./types";

export type ApiErrorKind =
  | "unconfigured"
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "server"
  | "unexpected";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly details: unknown;

  constructor(
    kind: ApiErrorKind,
    message: string,
    status: number | null,
    code: string | null = null,
    details: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
};

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  unconfigured: "The OpsPilot API is not configured.",
  network: "Could not reach the OpsPilot API. Check your connection.",
  unauthorized: "Your session has expired. Sign in again to continue.",
  forbidden: "You do not have permission to do that.",
  not_found: "That item could not be found.",
  validation: "Some details are invalid. Check the form and try again.",
  conflict: "That change conflicts with an existing record.",
  server: "The OpsPilot API encountered an internal error. Try again shortly.",
  unexpected: "The OpsPilot API returned an unexpected response.",
};

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status >= 500) return "server";
  return "unexpected";
}

/**
 * Standard fetch wrapper that communicates with either:
 * 1. The local Next.js Route Handlers (`/api/...`) which safely handle HttpOnly cookies, OR
 * 2. Directly with the Express backend if a token is supplied.
 */
export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  // If endpoint starts with /api/, we call the local Next.js proxy route handler
  // Otherwise prefix with /api/proxy/
  const isDirectNextApi = endpoint.startsWith("/api/auth");
  const url = isDirectNextApi
    ? endpoint
    : endpoint.startsWith("/api/")
      ? endpoint
      : `/api/proxy${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    credentials: "same-origin",
    cache: "no-store",
  };

  if (options.signal) init.signal = options.signal;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("network", DEFAULT_MESSAGES.network, null);
  }

  if (!response.ok) {
    const kind = kindForStatus(response.status);
    const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    const message = payload?.error?.message ?? DEFAULT_MESSAGES[kind];
    const code = payload?.error?.code ?? null;
    const details = payload?.error?.details ?? null;
    throw new ApiError(kind, message, response.status, code, details);
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);
  if (payload === null) {
    throw new ApiError("unexpected", DEFAULT_MESSAGES.unexpected, response.status);
  }
  return payload as T;
}
