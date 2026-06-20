/**
 * Encrypt ARI credentials for D1 seeding (local deploy only).
 * Usage: node seed-credentials.mjs <email> <password> <encryptionKey>
 */
import { webcrypto } from "node:crypto";

globalThis.crypto = webcrypto;

function b64ToBytes(b64) {
  const bin = Buffer.from(b64, "base64");
  return new Uint8Array(bin);
}

function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function importKey(secret) {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptText(plain, secret) {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${bytesToB64(iv)}.${bytesToB64(new Uint8Array(cipher))}`;
}

const email = process.argv[2];
const password = process.argv[3];
const encKey = process.argv[4];
if (!email || !password || !encKey) {
  console.error("Usage: node seed-credentials.mjs <email> <password> <encryptionKey>");
  process.exit(1);
}

const emailEnc = await encryptText(email, encKey);
const passEnc = await encryptText(password, encKey);
process.stdout.write(JSON.stringify({ emailEnc, passEnc }));
