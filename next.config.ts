import type { NextConfig } from "next";

/**
 * Тест встраивается в Tilda через iframe (Чертёж.md, «Интеграция: Tilda»).
 * По умолчанию браузеры блокируют встраивание в iframe чужого происхождения
 * (`X-Frame-Options`/`frame-ancestors` не заданы → некоторые окружения ставят
 * `DENY`). Разрешаем встраивание только со страниц Tilda и собственного домена
 * ровно на роутах теста и результата — остальные страницы (админка, вход)
 * встраивать в чужие фреймы незачем.
 */
const FRAME_ANCESTORS_CSP =
  "frame-ancestors 'self' https://*.tilda.ws https://enneagramma.one;";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self';" },
        ],
      },
      {
        source: "/test",
        headers: [{ key: "Content-Security-Policy", value: FRAME_ANCESTORS_CSP }],
      },
      {
        source: "/test/result/:path*",
        headers: [{ key: "Content-Security-Policy", value: FRAME_ANCESTORS_CSP }],
      },
    ];
  },
};

export default nextConfig;
