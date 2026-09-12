import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeavyOps — Sistem Manajemen Rental Alat Berat",
  description: "Ruang kerja operasional PT Penyewaan Alat Berat. Kelola armada, kontrak, jam kerja, dan penagihan dalam satu sistem.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* DM2 (audit 04): body tidak lagi memakai class Tailwind bg-slate-100/
            text-slate-900 — itu sumber kebenaran warna kedua di luar sistem
            --bg/--text. Sekarang globals.css satu-satunya penentu. */}
        {/* Anti-flash (audit 04 langkah 3): tentukan tema SEBELUM React mount —
            localStorage menang, kalau kosong ikut prefers-color-scheme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('heavyops-theme');var d=s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
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
