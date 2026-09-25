import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Preserve the Vite 5 browser target instead of silently raising it in Vite 7.
  build: { target: ["chrome87", "edge88", "firefox78", "safari14"] },
  server: { port: 5173 }
});
