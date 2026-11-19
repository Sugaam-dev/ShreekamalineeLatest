import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  poweredByHeader: false,
  agentRules: false,
  serverExternalPackages: ["pg"],
  experimental: { cpus: 1, webpackBuildWorker: false },
  async headers() {
    const security = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ];
    return ["/admin/:path*", "/api/admin/:path*"].map(source => ({ source, headers: security }));
  },
};

export default nextConfig;
