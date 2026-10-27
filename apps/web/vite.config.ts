import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const configuredBase = process.env.VITE_BASE_PATH || "/";
const base = configuredBase.endsWith("/")
  ? configuredBase
  : `${configuredBase}/`;

export default defineConfig({
  base,
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "冰箱管家",
        short_name: "冰箱管家",
        description: "好好存放，每一份新鲜",
        lang: "zh-CN",
        start_url: base,
        scope: base,
        display: "standalone",
        theme_color: "#1c7658",
        background_color: "#f8f9f5",
        icons: [
          {
            src: `${base}icons/icon-192.png`,
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: `${base}icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: `${base}icons/maskable-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/\/api\//],
        runtimeCaching: [{ urlPattern: /\/api\//, handler: "NetworkOnly" }],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4000000,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
});
