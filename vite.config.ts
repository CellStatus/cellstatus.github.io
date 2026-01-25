import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// Replit dev plugins removed

export default defineConfig({
  // Set base for GitHub Pages. Replace "/CellStatus/" if your repo name differs.
  base: "/CellStatus/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "https://cellstatus.onrender.com",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
