import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeavyOps — Sistem Manajemen Rental Alat Berat",
  description: "Ruang kerja operasional PT Penyewaan Alat Berat. Kelola armada, kontrak, jam kerja, dan penagihan dalam satu sistem.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
