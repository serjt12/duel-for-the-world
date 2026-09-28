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
// thread instead of one per test file (12 files -> up to 12 concurrent
// threads by default). Each thread commits its own V8 heap, and running
// them all at once was enough to exhaust available system memory
// ("FATAL ERROR: Committing semi space failed. Allocation failed -
// JavaScript heap out of memory"). This package's suite is small (well
// under a second of actual test time), so running it single-threaded
// costs a negligible amount of wall time in exchange for not competing
// for memory with everything else running on the machine.
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
