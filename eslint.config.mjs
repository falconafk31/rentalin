import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  // media-worker/ = paket terpisah (Cloudflare Worker, tsconfig + tooling
  // sendiri — wrangler); di-lint dengan konfigurasi Worker-nya.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "media-worker/**"]),
]);
