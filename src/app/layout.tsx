import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIMARDA — Monitoring Armada DLH",
  description:
    "Sistem monitoring armada truk sampah berbasis GPS: transparansi BBM, validasi rute, dan validasi titik pelayanan DLH.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
