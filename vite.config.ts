import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Xross Log",
        short_name: "Xross Log",
        description: "Xross Starsの対戦記録と分析",
        theme_color: "#07111f",
        background_color: "#07111f",
        display: "standalone",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: { navigateFallback: "index.html" },
    }),
  ],
});
