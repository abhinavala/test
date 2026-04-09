import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aria - AI Meeting Intelligence",
  description:
    "AI-powered meeting intelligence platform for insights, analytics, and collaboration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
