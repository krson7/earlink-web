import type {
  NextConfig,
} from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = (process.env.FASTAPI_HTTP_BASE_URL ||
      process.env.NEXT_PUBLIC_FASTAPI_HTTP_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    return [{ source: "/ws/:path*", destination: `${backend}/ws/:path*` }];
  },
};

export default nextConfig;
