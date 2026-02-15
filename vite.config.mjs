import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Work around a deps discovery hang in this repo structure by prebundling only known core deps.
    // Vite 5.x: use noDiscovery/include instead of optimizeDeps.disabled.
    noDiscovery: true,
    include: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\\/api/, ""),
      },
    },
  },
});
