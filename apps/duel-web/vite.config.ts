import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so the same build works inside the Android app
  // (Capacitor) as well as on a web server.
  base: "./",
});
