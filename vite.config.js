import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Kraal Declare",
        short_name: "Kraal Declare",
        description: "Livestock records and DVS declaration management",
        theme_color: "#3D4B2E",
        background_color: "#F4EFE3",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // App shell (HTML/JS/CSS) cached for offline load.
        // Supabase API calls are NOT cached here — those are handled
        // by our own offline write-queue in src/offline.js instead,
        // since API responses need smarter handling than a blanket cache.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});
