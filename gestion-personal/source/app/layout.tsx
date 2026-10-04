import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GESTIÓN DE PERSONAL",
  description: "Personal de seguridad, servicios, horas laboradas y permisos.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
