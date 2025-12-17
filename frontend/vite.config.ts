import path from "path";
import tailwindcss from "@tailwindcss/vite";
// import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cssInjectedByJs from "vite-plugin-css-injected-by-js";

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react(), tailwindcss()],
//   resolve: {
//     alias: {
//       "@": path.resolve(__dirname, "./src"),
//     },
//   },
// });

import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cssInjectedByJs()],
  build: {
    lib: {
      entry: "src/anywidget_entry.tsx",
      formats: ["es"],
      fileName: () => "spatialvista_widget.mjs",
    },
    rollupOptions: {
      external: [],
    },
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "process.env": {},
    process: {},
  },
  server: {
    open: true,
  },
});
