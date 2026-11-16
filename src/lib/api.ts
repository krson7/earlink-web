const FASTAPI_HTTP_BASE_URL =
  process.env.NEXT_PUBLIC_FASTAPI_HTTP_BASE_URL ?? "http://localhost:8000";

type ErrorResponse = {
  detail?: unknown;
};

/** Keeps the HTTP status so callers can tell "API not deployed" (404) apart. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function getApiErrorMessage(body: ErrorResponse | null): string {
  return typeof body?.detail === "string"
    ? body.detail
    : "서버 요청을 처리하지 못했습니다.";
}

export async function requestJson<T>(path: string, options: RequestInit): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${FASTAPI_HTTP_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(getApiErrorMessage(body as ErrorResponse | null), response.status);
  }

  return body as T;
}