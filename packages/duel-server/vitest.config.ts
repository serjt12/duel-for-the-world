import { defineConfig } from "vitest/config";

// Runs tests in worker THREADS instead of forked processes (vitest's
// default pool). Process forks are what "Worker exited unexpectedly" /
// "[vitest-pool]: Worker forks emitted error" crashes come from: something
// outside Node killed a freshly-spawned node.exe before it finished --
// most likely antivirus real-time scanning, or OneDrive's live sync
// locking files while this repo (under OneDrive) is being read from a
// new process. Threads share this one Node process instead of spawning
// separate OS processes, which sidesteps that class of interference.
//
// singleThread: true additionally caps this package's run to ONE worker
// thread (see packages/duel-engine/vitest.config.ts's comment): running
// one thread per test file at once was enough to exhaust available
// system memory. These suites are tiny, so this costs almost no wall
// time in exchange for not competing for memory.
export default defineConfig({
  test: {
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
