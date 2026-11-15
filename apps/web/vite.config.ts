import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // The server's port comes from the repo-root .env that `pnpm dev` also gives the server.
  const env = loadEnv(mode, "../..", "");
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "SnapTrack",
          short_name: "SnapTrack",
          description: "Household receipts and spending",
          display: "standalone",
          start_url: "/",
          background_color: "#141615",
          theme_color: "#141615",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [/^\/rpc\//, /^\/healthz$/],
          // Inter is self-hosted (docs/DESIGN.md); keep the Latin subsets for offline use.
          globPatterns: ["**/*.{js,css,html,png,webmanifest}", "assets/inter-latin-*.woff2"],
        },
      }),
    ],
    server: {
      proxy: { "/rpc": `http://127.0.0.1:${env["PORT"] ?? "4310"}` },
    },
  };
});
