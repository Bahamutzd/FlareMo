import { describe, expect, it } from "vitest";
import { isAndroidApp } from "./native-app";

describe("isAndroidApp", () => {
  it("recognises the Android app's user agent marker", () => {
    expect(
      isAndroidApp(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 FlareMoAndroid",
      ),
    ).toBe(true);
  });

  it("treats ordinary mobile and desktop browsers as the web app", () => {
    expect(
      isAndroidApp(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isAndroidApp(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});
