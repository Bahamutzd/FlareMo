/**
 * Reads the Better Auth session token out of the browser's cookie without
 * loading Better Auth.
 *
 * Better Auth stores `<token>.<base64 HMAC-SHA256(token)>` (URL-encoded) in
 * `flaremo.session_token`, with the `__Secure-` prefix on HTTPS deployments,
 * signed with BETTER_AUTH_SECRET. Verifying the signature here lets the
 * request path look the session up itself, joined with the user and
 * membership in a single query. A cookie this module cannot verify yields
 * `null`, and the caller falls back to Better Auth's own session read.
 */

import { getRequiredBetterAuthSecret } from "./auth-env";
import type { FlareMoEnv } from "./env";

const SESSION_COOKIE_NAMES = [
  "__Secure-flaremo.session_token",
  "flaremo.session_token",
];

const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string) {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keyCache.set(secret, key);
  }
  return key;
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/** The verified session token, or null when absent or not verifiable here. */
export async function readSignedSessionToken(
  env: FlareMoEnv,
  headers: Headers,
): Promise<string | null> {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return null;
  for (const name of SESSION_COOKIE_NAMES) {
    const value = readCookie(cookieHeader, name);
    if (!value) continue;
    const dot = value.lastIndexOf(".");
    if (dot < 1) return null;
    const token = value.slice(0, dot);
    const signature = value.slice(dot + 1);
    if (signature.length !== 44 || !signature.endsWith("=")) return null;
    let signatureBytes: Uint8Array<ArrayBuffer>;
    try {
      signatureBytes = Uint8Array.from(atob(signature), (char) =>
        char.charCodeAt(0),
      );
    } catch {
      return null;
    }
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(getRequiredBetterAuthSecret(env)),
      signatureBytes,
      new TextEncoder().encode(token),
    );
    return valid ? token : null;
  }
  return null;
}
