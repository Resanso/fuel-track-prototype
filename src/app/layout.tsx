import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cartrack Fleet — Sistem Manajemen Armada",
  description:
    "Pemimpin kelas dunia dalam solusi manajemen armada. Live tracking, fuel monitoring, driver behavior, dan geofence management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
