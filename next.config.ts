import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY", // Забороняє вбудовувати ваш PWA в сторонній iframe
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff", // Запобігає MIME-sniffing атакам
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()", // Забороняє браузеру відкривати сенсори
          },
        ],
      },
    ];
  },
};

export default nextConfig;