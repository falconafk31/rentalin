import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { DASHBOARD_THEME_KEY } from "@/lib/dashboard-theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeavyOps — Sistem Manajemen Rental Alat Berat",
  description: "Ruang kerja operasional PT Penyewaan Alat Berat. Kelola armada, kontrak, jam kerja, dan penagihan dalam satu sistem.",
};

const dashboardThemeBootScript = `(() => {
  try {
    if (window.localStorage.getItem('${DASHBOARD_THEME_KEY}') === 'dark') {
      const el = document.querySelector('.app-shell');
      if (el) {
        el.classList.add('dashboard-dark');
      } else {
        const observer = new MutationObserver(() => {
          const target = document.querySelector('.app-shell');
          if (target) {
            target.classList.add('dashboard-dark');
            observer.disconnect();
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    }
  } catch (_) {}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <Script id="dashboard-theme-boot" strategy="beforeInteractive">
          {dashboardThemeBootScript}
        </Script>
        {/* Font dimuat via <link> + preconnect, bukan @import di CSS yang
            memblokir render dan memperlambat first paint. next/font tidak
            dipakai agar build tidak bergantung pada akses jaringan ke Google
            Fonts (aturan no-page-custom-font adalah false positive untuk App
            Router — tidak ada pages/_document di proyek ini). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500;550;600;650;700;750;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

