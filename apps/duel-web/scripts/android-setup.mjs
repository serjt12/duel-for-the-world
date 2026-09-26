// Touch-ups to the Android project that `cap add android` generates (run
// automatically by `pnpm android:add`; safe to run again at any time with
// `pnpm android:setup`):
//
// 1. Landscape only: the game is designed for a landscape screen.
// 2. Full screen: hide the status and navigation bars while playing
//    (swipe from an edge to show them for a moment).
// 3. Vibration: the game buzzes on hits and scandals (navigator.vibrate
//    needs the VIBRATE permission inside the app).
// 4. Name and app id: taken from capacitor.config.json.
// 5. Icon and launch screen: copied from branding/android/res.
// 6. Release signing: release builds are signed with the key described in
//    android/keystore.properties (never committed; see docs/ANDROID.md).
//
// Each step says what it did, and leaves alone anything already done.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const androidDir = join(webRoot, "android");
const mainDir = join(androidDir, "app/src/main");
const resDir = join(mainDir, "res");

function read(path) {
  return readFileSync(path, "utf8");
}

// Keep a file's line endings (Windows checkouts may use CRLF).
function write(path, text, original) {
  const crlf = original.includes("\r\n");
  writeFileSync(path, crlf ? text.replace(/\r?\n/g, "\r\n") : text);
}

function update(path, label, change) {
  const original = read(path);
  const text = original.replace(/\r\n/g, "\n");
  const next = change(text);
  if (next === text) {
    console.log(`${label}: already done -- left as is.`);
    return;
  }
  write(path, next, original);
  console.log(`${label}: updated.`);
}

// --- 1. Landscape -------------------------------------------------------------
const manifestPath = join(mainDir, "AndroidManifest.xml");
update(manifestPath, "AndroidManifest.xml (landscape)", (text) =>
  text.includes("android:screenOrientation")
    ? text
    : text.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"'),
);

// --- 3. Vibration ---------------------------------------------------------------
update(manifestPath, "AndroidManifest.xml (vibration)", (text) =>
  text.includes("android.permission.VIBRATE")
    ? text
    : text.replace(/(\s*)<\/manifest>/, '\n    <uses-permission android:name="android.permission.VIBRATE" />$1</manifest>'),
);

// --- 2. Full screen -------------------------------------------------------------
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

const activityPath = findMainActivity(join(mainDir, "java"));
if (!activityPath) {
  console.log("MainActivity.java not found -- full screen not set up.");
} else {
  const source = read(activityPath);
  const packageLine = source.match(/^package\s+[\w.]+;/m)?.[0];
  const isDefault = /public class MainActivity extends BridgeActivity\s*\{\s*\}/.test(source);
  if (source.includes("WindowInsetsCompat.Type.systemBars()")) {
    console.log("MainActivity.java (full screen): already done -- left as is.");
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

// --- 4. Name and app id -----------------------------------------------------------
// The app id Google Play knows the game by. The Java package (`namespace`)
// can stay as it is: players never see it.
const config = JSON.parse(read(join(webRoot, "capacitor.config.json")));
const gradlePath = join(androidDir, "app/build.gradle");
update(gradlePath, `build.gradle (app id ${config.appId})`, (text) =>
  text.replace(/applicationId\s+"[^"]*"/, `applicationId "${config.appId}"`),
);
const xmlText = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
update(join(resDir, "values/strings.xml"), `strings.xml (name "${config.appName}")`, (text) =>
  text
    .replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${xmlText(config.appName)}$2`)
    .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${xmlText(config.appName)}$2`)
    .replace(/(<string name="package_name">)[^<]*(<\/string>)/, `$1${config.appId}$2`)
    .replace(/(<string name="custom_url_scheme">)[^<]*(<\/string>)/, `$1${config.appId}$2`),
);

// --- 5. Icon and launch screen ------------------------------------------------------
const brandingRes = join(webRoot, "branding/android/res");
function copyTree(from) {
  let copied = 0;
  for (const name of readdirSync(from)) {
    const source = join(from, name);
    if (statSync(source).isDirectory()) {
      copied += copyTree(source);
    } else {
      const target = join(resDir, relative(brandingRes, source));
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      copied += 1;
    }
  }
  return copied;
}
if (existsSync(brandingRes)) {
  console.log(`Icon and launch screen: copied ${copyTree(brandingRes)} images.`);
}
// The adaptive icon's background is an image (a soft navy glow), not a flat colour.
for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
  const path = join(resDir, "mipmap-anydpi-v26", name);
  if (existsSync(path)) {
    update(path, `${name} (icon background)`, (text) =>
      text.replace('android:drawable="@color/ic_launcher_background"', 'android:drawable="@mipmap/ic_launcher_background"'),
    );
  }
}
const iconColour = join(resDir, "values/ic_launcher_background.xml");
if (existsSync(iconColour)) {
  update(iconColour, "ic_launcher_background.xml (colour)", (text) =>
    text.replace(/(<color name="ic_launcher_background">)[^<]*(<\/color>)/, "$1#151A2E$2"),
  );
}
// Android 12+ draws its own launch screen: the icon on this colour.
update(join(resDir, "values/styles.xml"), "styles.xml (launch screen colour)", (text) =>
  text.includes("windowSplashScreenBackground")
    ? text
    : text.replace(
        /(<style name="AppTheme.NoActionBarLaunch"[^>]*>)/,
        '$1\n        <item name="windowSplashScreenBackground">#151A2E</item>',
      ),
);

// --- 6. Release signing -------------------------------------------------------------
update(gradlePath, "build.gradle (release signing)", (text) => {
  if (text.includes("keystore.properties")) return text;
  const loader = `// Release signing: android/keystore.properties (never committed) says where
// the upload key is. Without it, release builds are simply unsigned.
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
}

`;
  const signing = `    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            if (keystorePropertiesFile.exists()) {
                signingConfig signingConfigs.release
            }`;
  return text
    .replace(/^android \{/m, `${loader}android {`)
    .replace(/    buildTypes \{\n        release \{/, signing);
});
update(join(androidDir, ".gitignore"), ".gitignore (signing key)", (text) =>
  text.includes("keystore.properties")
    ? text
    : `${text.trimEnd()}\n\n# Release signing: the key and its passwords never go into git.\nkeystore.properties\n*.jks\n*.keystore\n`,
);
