import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The FlareMo Android app is a native shell around a FlareMo deployment: the
 * WebView loads the instance itself, so sign-in cookies, same-origin API
 * calls, share links and the capture WebSocket all behave exactly as they do
 * in the browser. The instance is chosen at build time through
 * FLAREMO_APP_URL (see scripts/prepare.mjs), so one workflow can build an
 * APK for any deployment.
 */
const serverUrl = process.env.FLAREMO_APP_URL?.trim();
if (!serverUrl) {
  throw new Error(
    "FLAREMO_APP_URL must be set to the FlareMo instance the app opens, e.g. https://notes.example.com",
  );
}
const origin = new URL(serverUrl);

const config: CapacitorConfig = {
  appId: process.env.FLAREMO_APP_ID?.trim() || "app.flaremo.android",
  appName: process.env.FLAREMO_APP_NAME?.trim() || "FlareMo",
  // Only the offline fallback page ships in the APK; see scripts/prepare.mjs.
  webDir: "www",
  server: {
    url: origin.origin,
    // Navigation inside the instance stays in the app; any other host opens
    // in the system browser (handled by MainActivity).
    allowNavigation: [origin.host],
    errorPath: "offline.html",
  },
  android: {
    // Plain HTTP instances are a development setup only.
    allowMixedContent: false,
    // Lets the web app recognise the shell and hide browser-only features
    // (install prompt, Web Push); see apps/web/src/lib/native-app.ts.
    appendUserAgent: "FlareMoAndroid",
  },
  plugins: {
    SystemBars: {
      // Keep the WebView clear of the status and navigation bars: the web
      // app is not laid out edge to edge.
      insetsHandling: "native",
    },
  },
};

export default config;
