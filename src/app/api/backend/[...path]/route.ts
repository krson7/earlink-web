import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const allowedRequests = new Set(["GET rooms/device", "PUT rooms/device", "POST rooms/join"]);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!allowedRequests.has(`${request.method} ${endpoint}`)) {
    return Response.json({ detail: "지원하지 않는 요청입니다." }, { status: 404 });
  }

  const base = (process.env.FASTAPI_HTTP_BASE_URL ||
    process.env.NEXT_PUBLIC_FASTAPI_HTTP_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

  try {
    const upstream = await fetch(`${base}/${endpoint}`, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    return new Response(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { detail: "대화 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PUT };
