import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// Extra hostnames the dev server answers to, e.g. when it sits behind a reverse proxy or a
// tunnel: ACCENTDOJO_ALLOWED_HOSTS=dev.example.com,other.example.com (empty: localhost only).
const ALLOWED_HOSTS = (process.env.ACCENTDOJO_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Registered in src/main.tsx, which also checks for updates and reloads onto them.
      injectRegister: false,
      // Take over open pages at once, so registerSW sees "controlling" and reloads them.
      workbox: { skipWaiting: true, clientsClaim: true },
      devOptions: { enabled: true, type: "module" },
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Accent Dojo",
        short_name: "Accent Dojo",
        description: "Pronunciation practice: hear a phrase, say it, see which words to listen to again.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
    // The FastAPI backend (backend/, `uvicorn accentdojo.app:app --port 8000`).
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
    // The mock imports the shared phrase set from ../content.
    fs: { allow: [path.resolve(import.meta.dirname, "..")] },
  },
})
