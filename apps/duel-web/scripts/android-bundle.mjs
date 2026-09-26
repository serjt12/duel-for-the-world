// Builds the file you upload to Google Play: a signed Android App Bundle
// (.aab). Run it with `pnpm android:bundle` (it builds the web app and
// syncs it into the Android project first).
//
// Needs android/keystore.properties -- see docs/ANDROID.md, "Release builds".
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const androidDir = fileURLToPath(new URL("../android/", import.meta.url));
const keystoreProperties = join(androidDir, "keystore.properties");

if (!existsSync(keystoreProperties)) {
  console.error(
    "No android/keystore.properties yet, so the build can't be signed.\n" +
      "Create your upload key first: see docs/ANDROID.md, section \"Release builds\".",
  );
  process.exit(1);
}

// Show which version this is: Google Play refuses a versionCode it has seen before.
const gradle = readFileSync(join(androidDir, "app/build.gradle"), "utf8");
const versionCode = gradle.match(/versionCode\s+(\d+)/)?.[1] ?? "?";
const versionName = gradle.match(/versionName\s+"([^"]*)"/)?.[1] ?? "?";
console.log(`Building version ${versionName} (versionCode ${versionCode})...`);

const windows = process.platform === "win32";
const result = spawnSync(windows ? "gradlew.bat" : "./gradlew", ["bundleRelease"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: windows,
});
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  "\nDone. Upload this file to Google Play:\n" +
    `  ${join(androidDir, "app", "build", "outputs", "bundle", "release", "app-release.aab")}\n` +
    "Before the next upload, raise versionCode (and versionName) in android/app/build.gradle.",
);
