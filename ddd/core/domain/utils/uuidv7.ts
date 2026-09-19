/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { randomBytes } from 'node:crypto';

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Generates a UUIDv7 string per RFC 9562.
 *
 * Zero external dependencies — uses Node.js built-in `crypto.randomBytes()`.
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);

  // Encode unix timestamp (ms) into the first 48 bits (bytes 0-5)
  const now = Date.now();
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  // Set version nibble to 7 (byte 6, high nibble)
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Set variant to 0b10 (byte 8, high 2 bits)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  // Format as standard UUID string
  const hex = bytes.toString('hex');
  return (
    hex.substring(0, 8) +
    '-' +
    hex.substring(8, 12) +
    '-' +
    hex.substring(12, 16) +
    '-' +
    hex.substring(16, 20) +
    '-' +
    hex.substring(20, 32)
  );
}

/** Returns true when the value is a non-empty valid RFC 9562 UUID v7 string. */
export function isUuidV7(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  return UUID_V7_REGEX.test(trimmed);
}
