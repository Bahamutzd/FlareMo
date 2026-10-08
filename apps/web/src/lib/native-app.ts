/**
 * True inside the FlareMo Android app, whose WebView appends this marker to
 * the user agent (apps/android/capacitor.config.ts). The app is already
 * installed and its WebView has no Web Push, so the browser's install and
 * push-notification affordances are hidden there.
 */
export function isAndroidApp(
  userAgent: string = typeof navigator === "undefined"
    ? ""
    : navigator.userAgent,
): boolean {
  return /\bFlareMoAndroid\b/.test(userAgent);
}
