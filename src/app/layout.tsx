import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Budget Graph AI",
  description: "Особистий фінансовий трекер",
};

// Це вмикає підтримку env(safe-area-inset-*) на iPhone
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" className="bg-black">
      <body className="bg-black antialiased">{children}</body>
    </html>
  );
}