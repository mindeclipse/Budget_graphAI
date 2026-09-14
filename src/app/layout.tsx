import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { Toaster } from "sonner";
import "./globals.css";

const appUrl =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://budget-graph-ai-w8r2.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "BudgetGraph — Розумний фінансовий трекер",
  description:
    "Миттєвий облік витрат через Apple Pay, темп зарплатного циклу, аналітика портфеля та AI-асистент.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent", // Фон програми плавно затікає під острівець
    title: "BudgetGraph",
  },
  openGraph: {
    title: "BudgetGraph — Розумний фінансовий трекер",
    description:
      "Миттєвий облік витрат через Apple Pay, темп зарплатного циклу, аналітика портфеля та AI-асистент.",
    url: appUrl.endsWith("/") ? appUrl : `${appUrl}/`,
    siteName: "BudgetGraph",
    locale: "uk_UA",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "BudgetGraph — Розумний фінансовий трекер",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BudgetGraph — Розумний фінансовий трекер",
    description:
      "Миттєвий облік витрат через Apple Pay, темп зарплатного циклу, аналітика портфеля та AI-асистент.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
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
        <Toaster
          position="top-center"
          theme="dark"
          richColors
          closeButton
          offset={{
            top: "calc(env(safe-area-inset-top, 0px) + 16px)",
            left: "16px",
            right: "16px",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          }}
          mobileOffset={{
            top: "calc(env(safe-area-inset-top, 0px) + 16px)",
            left: "16px",
            right: "16px",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          }}
        />
      </body>
    </html>
  );
}
