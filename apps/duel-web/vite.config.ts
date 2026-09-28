import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the same build works inside the Android app
  // (Capacitor) as well as on a web server.
  base: "./",
  // See packages/duel-engine/vitest.config.ts's comment: worker threads
  // instead of forked processes, to avoid "Worker exited unexpectedly"
  // crashes from antivirus/OneDrive interfering with spawned processes;
  // singleThread caps concurrency to avoid exhausting system memory.
  test: {
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
