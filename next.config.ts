import type { NextConfig } from "next";

// CSP produksi (TASK-1 O-E): hanya di production agar HMR development
// (yang butuh 'unsafe-eval') tidak terganggu. Diizinkan: skrip/style
// inline Next.js, font Google, Storage Supabase (img https + blob
// pratinjau), dan koneksi Supabase REST + realtime.
const isProd = process.env.NODE_ENV === "production";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Security headers (audit A3): anti-clickjacking, anti-MIME-sniffing,
  // referrer ketat, dan nonaktifkan sensor browser yang tak dipakai.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
