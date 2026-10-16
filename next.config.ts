import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  // Classic dynamic rendering model: nearly every page depends on the session,
  // cart and locale cookies, so Cache Components would add little here.
  poweredByHeader: false,
  // Fonts read at runtime by the PDF receipt route must ship with the serverless bundle.
  outputFileTracingIncludes: { "/api/orders/[id]/receipt": ["./assets/fonts/**"], "/api/invoices/[id]": ["./assets/fonts/**"], "/api/og": ["./assets/fonts/**"], "/api/og/p/[slug]": ["./assets/fonts/**"] },
  serverExternalPackages: ["@node-rs/argon2", "pg-boss", "exceljs", "pdf-lib", "nodemailer", "web-push"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "t.me" },
    ],
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/uploads/**" }, { pathname: "/brand/**" }, { pathname: "/demo/**" }, { pathname: "/icons/**" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/.well-known/assetlinks.json", destination: "/api/well-known/assetlinks" },
      { source: "/.well-known/apple-app-site-association", destination: "/api/well-known/apple-app-site-association" },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
