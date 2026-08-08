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
  async headers() {
    return [
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
