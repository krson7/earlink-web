type ErrorResponse = {
  detail?: unknown;
};

/** Keeps the HTTP status so callers can tell "API not deployed" (404) apart. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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

  let response: Response;
  try {
    // The server contacts FastAPI. A phone must never fetch its own localhost.
    response = await fetch(`/api/backend${path}`, {
      ...options,
      headers,
      cache: "no-store",
      signal: options.signal ?? AbortSignal.timeout(12_000),
    });
  } catch (failure) {
    if (options.signal?.aborted) throw failure;
    throw new ApiError("서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(getApiErrorMessage(body as ErrorResponse | null), response.status);
  }

  return body as T;
}
