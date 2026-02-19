import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FuelTrack — Smart Fuel Tracking Platform",
  description:
    "Track your vehicle fuel consumption, monitor efficiency, and optimize routes with real-time 3D maps.",
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
