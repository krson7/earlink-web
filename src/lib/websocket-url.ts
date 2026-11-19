export function getWebSocketUrl(path: string): string {
  const configured = process.env.NEXT_PUBLIC_FASTAPI_WS_BASE_URL?.trim();
  const base = new URL(configured || window.location.origin, window.location.origin);
  // Retain explicit public servers, but route old localhost settings through Next.
  if (["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
    base.href = window.location.origin;
  }
  base.protocol = base.protocol === "https:" || base.protocol === "wss:" ? "wss:" : "ws:";
  return `${base.href.replace(/\/+$/, "")}${path}`;
}
