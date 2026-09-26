import "./style.css";
import { startApp } from "./app";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Missing #app root element");
}

// The online server: set VITE_SERVER_URL (e.g. wss://your-server) when
// building for a phone; local development uses ws://localhost:8080. A
// release build with no server set has no online play yet ("coming soon").
const serverUrl = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? undefined : null);
startApp(appRoot, serverUrl);
