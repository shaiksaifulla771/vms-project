import type { ApiErrorBody } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(status: number, body: ApiErrorBody | string) {
    const detail = typeof body === "string" ? body : body.detail;
    super(detail);
    this.status = status;
    this.retryable = typeof body === "object" && body.retryable === true;
  }
}

let bearerToken: string | null = null;

export function setAuthToken(token: string | null): void {
  bearerToken = token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Every mutating call in this system is idempotent on a natural key (a
 * PR/PO number, or an idempotency_key for PR->PO conversion), and a 409
 * with retryable:true means the transaction never ran at all — so
 * resending the identical request is always safe. Bounded backoff with
 * jitter, never more than 3 attempts.
 */
async function requestWithRetry<T>(path: string, init: RequestInit): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        ...init.headers,
      },
    });

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }

    let body: ApiErrorBody | string;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = response.statusText;
    }

    const error = new ApiError(response.status, body);
    if (error.retryable && attempt < maxAttempts) {
      const backoffMs = 200 * 2 ** (attempt - 1) + Math.random() * 100;
      await sleep(backoffMs);
      continue;
    }
    throw error;
  }
  throw new ApiError(500, "unreachable");
}

export const api = {
  get: <T>(path: string) => requestWithRetry<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    requestWithRetry<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    requestWithRetry<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
};
