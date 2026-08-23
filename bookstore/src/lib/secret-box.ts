import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "enc:v1";

function encryptionKey() {
  const encoded = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!encoded) throw new Error("INTEGRATION_ENCRYPTION_KEY is required for integration secrets");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}

export function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function sealSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function openSecret(value: string) {
  if (!isSealed(value)) {
    if (process.env.NODE_ENV === "production") throw new Error("Unencrypted integration secret must be rotated before launch");
    return value;
  }
  const [, , iv, tag, encrypted] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

export function sealJson(value: unknown) {
  return sealSecret(JSON.stringify(value));
}
