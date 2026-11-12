import type { NextConfig } from "next";

const internal = new URL(
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001",
);
if (
  !["http:", "https:"].includes(internal.protocol) ||
  internal.origin !== internal.href.replace(/\/$/, "")
) {
  throw new Error("API_INTERNAL_URL must be an HTTP(S) origin");
}
// Next buffers proxied request bodies up to this size (default 10 MB). It must
// exceed the API request limit (26 000 000 bytes) so the API, not a truncated
// proxy stream, decides 413 for uploads up to 25 000 000 bytes.
const PROXY_BODY_LIMIT_BYTES = 27_000_000;
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { proxyClientMaxBodySize: PROXY_BODY_LIMIT_BYTES },
  rewrites() {
    return [
      { source: "/api/:path*", destination: `${internal.origin}/api/:path*` },
    ];
  },
};
export default config;
