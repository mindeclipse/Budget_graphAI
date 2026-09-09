import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Budget Graph AI",
  description: "Особистий фінансовий трекер",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent", // Фон програми плавно затікає під острівець
    title: "Finances",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" className="bg-zinc-950">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <ServiceWorkerRegister />
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
