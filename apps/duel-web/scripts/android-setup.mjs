// One-time touch-ups to the Android project that `cap add android`
// generates (run automatically by `pnpm android:add`; safe to run again):
//
// 1. Landscape only: the game is designed for a landscape screen.
// 2. Full screen: hide the status and navigation bars while playing
//    (swipe from an edge to show them for a moment).
//
// Each step only changes the file if it still looks like Capacitor's
// default, and says what it did.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const androidRoot = new URL("../android/app/src/main/", import.meta.url);

// --- 1. Landscape ---------------------------------------------------------
const manifestUrl = new URL("AndroidManifest.xml", androidRoot);
let manifest = readFileSync(manifestUrl, "utf8");
if (manifest.includes("android:screenOrientation")) {
  console.log("AndroidManifest.xml: orientation already set -- left as is.");
} else {
  manifest = manifest.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
  writeFileSync(manifestUrl, manifest);
  console.log("AndroidManifest.xml: locked to landscape (sensorLandscape).");
}

// --- 2. Full screen ---------------------------------------------------------
function findMainActivity(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      const found = findMainActivity(path);
      if (found) return found;
    } else if (name === "MainActivity.java") {
      return path;
    }
  }
  return null;
}

const javaDir = fileURLToPath(new URL("java/", androidRoot));
const activityPath = findMainActivity(javaDir);
if (!activityPath) {
  console.log("MainActivity.java not found -- full screen not set up.");
} else {
  const source = readFileSync(activityPath, "utf8");
  const packageLine = source.match(/^package\s+[\w.]+;/m)?.[0];
  const isDefault = /public class MainActivity extends BridgeActivity\s*\{\s*\}/.test(source);
  if (source.includes("WindowInsetsCompat.Type.systemBars()")) {
    console.log("MainActivity.java: full screen already enabled -- left as is.");
  } else if (!packageLine || !isDefault) {
    console.log("MainActivity.java is not Capacitor's default -- full screen left for you to add.");
  } else {
    writeFileSync(
      activityPath,
      `${packageLine}

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Full screen for the game: hide the status and navigation bars.
    // A swipe from the edge shows them briefly.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
    }
}
`,
    );
    console.log("MainActivity.java: full screen enabled.");
  }
}
