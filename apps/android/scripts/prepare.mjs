// Prepares the files `cap sync` copies into the Android project:
//   - www/offline.html: the page Capacitor shows when the instance cannot be
//     reached. It ships inside the APK, so its retry goes back to the
//     instance URL instead of reloading itself.
//   - Launcher icons and launch screens for every density, cut from the web
//     app's brand PNGs.
// Run from apps/android with FLAREMO_APP_URL set (the workflow does this).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const brand = join(root, "..", "web", "public", "brand");

const appUrl = process.env.FLAREMO_APP_URL?.trim();
if (!appUrl) {
  throw new Error("FLAREMO_APP_URL must be set (the FlareMo instance URL).");
}
const instance = new URL(appUrl).origin;

const offlinePage = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>FlareMo</title>
    <style>
      :root { color-scheme: light dark; --bg: #faf9f7; --fg: #17191d; --muted: #6b6b70; --accent: #f2603c; }
      @media (prefers-color-scheme: dark) { :root { --bg: #0d0c0b; --fg: #f2f1ef; --muted: #9a9a9f; } }
      html, body { margin: 0; height: 100%; }
      body { display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box;
        background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; text-align: center; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0 0 20px; color: var(--muted); font-size: 14px; line-height: 1.6; }
      button { border: 0; border-radius: 999px; padding: 10px 28px; font-size: 15px; background: var(--accent); color: #fff; }
    </style>
  </head>
  <body>
    <main>
      <h1>无法连接 FlareMo</h1>
      <p>请检查网络后重试。</p>
      <button type="button" onclick="location.replace(${JSON.stringify(`${instance}/`)})">重试</button>
    </main>
  </body>
</html>
`;

mkdirSync(join(root, "www"), { recursive: true });
writeFileSync(join(root, "www", "offline.html"), offlinePage);
// Capacitor requires an index.html in webDir even when server.url is set.
writeFileSync(
  join(root, "www", "index.html"),
  `<!doctype html><meta charset="UTF-8" /><script>location.replace(${JSON.stringify(`${instance}/`)})</script>\n`,
);

const res = join(root, "android", "app", "src", "main", "res");
// Legacy launcher icons (square, pre-cut corners) and the adaptive icon's
// foreground layer. The maskable PNG keeps the mark inside the safe zone,
// so it doubles as the adaptive foreground over the dark background colour.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, scale] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${name}`);
  mkdirSync(dir, { recursive: true });
  const legacy = Math.round(48 * scale);
  const foreground = Math.round(108 * scale);
  await sharp(join(brand, "flaremo-app-icon-512.png"))
    .resize(legacy, legacy)
    .png()
    .toFile(join(dir, "ic_launcher.png"));
  await sharp(join(brand, "flaremo-app-icon-maskable-512.png"))
    .resize(legacy, legacy)
    .png()
    .toFile(join(dir, "ic_launcher_round.png"));
  await sharp(join(brand, "flaremo-app-icon-maskable-512.png"))
    .resize(foreground, foreground)
    .png()
    .toFile(join(dir, "ic_launcher_foreground.png"));
}

// Launch screen: the app icon centred on the web app's dark background,
// shown while the instance loads.
const splashBackground = { r: 0x0d, g: 0x0c, b: 0x0b, alpha: 1 };
const splashes = {
  drawable: [480, 320],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
};
for (const [folder, [width, height]] of Object.entries(splashes)) {
  const dir = join(res, folder);
  mkdirSync(dir, { recursive: true });
  const mark = Math.round(Math.min(width, height) * 0.28);
  const icon = await sharp(join(brand, "flaremo-app-icon-512.png"))
    .resize(mark, mark)
    .png()
    .toBuffer();
  await sharp({
    create: { width, height, channels: 4, background: splashBackground },
  })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toFile(join(dir, "splash.png"));
}

console.log(`Prepared the Android shell for ${instance}`);
