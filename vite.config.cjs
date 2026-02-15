/** @type {import('vite').UserConfig} */
module.exports = {
  // Prevent a dependency discovery hang in this repo by prebundling only core deps.
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react-dom"],
  },
  esbuild: {
    // Keep React TSX working without @vitejs/plugin-react (which forces config bundling/imports).
    jsx: "automatic",
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
};

