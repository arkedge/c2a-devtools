import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pluginRewriteAll from "vite-plugin-rewrite-all";

export default defineConfig({
  resolve: {},
  plugins: [react(), pluginRewriteAll()],
  server: {
    hmr: {},
  },
  define: {
    "process.env": {},
  },
});
