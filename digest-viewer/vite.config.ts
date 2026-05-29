import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** GitHub Pages 项目站：https://<user>.github.io/<repo>/ → CI 设 VITE_BASE=/<repo>/ */
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "./",
});
