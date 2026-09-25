/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability, CapabilityString } from '../types/casl.types';

/**
 * Expand a compact {@link CapabilityString} (e.g. from a JWT or cookie) back
 * into a structured {@link Capability}.
 *
 * This is a **runtime-only deserialisation** step — the inverse of
 * {@link serializeCapability}.
 *
 * Format: `[!]subject|action[|conditions[|fields[|reason]]]`
 *
 * - Prefix with `!` to create an inverted (deny) rule
 * - Use CASL's `all` for any subject and `manage` for any action
 * - `*` as conditions (or omitted) means no conditions
 * - `*` as fields (or omitted) means all fields
 * - Conditions remain readable JSON unless they contain `|`; those values are
 *   `~`-prefixed base64url JSON so segment parsing stays reversible
 * - Safe fields are comma-separated: `title,body,status`
 * - Delimiter-bearing subject/action/fields/reason values are `~`-prefixed
 *   base64url JSON so every valid capability can round-trip
 *
 * @throws {Error} When the subject segment is empty or missing.
 * @throws {Error} When the action segment is empty or missing.
 * @throws {Error} When the conditions segment is not a JSON object.
 *
 * @example
 * ```ts
 * parseCapabilityString('Post|read|*')
 * // → { subject: 'Post', action: 'read' }
 *
 * parseCapabilityString('Post|manage|*')
 * // → { subject: 'Post', action: 'manage' }
 *
 * parseCapabilityString('!Post|delete|*')
 * // → { subject: 'Post', action: 'delete', inverted: true }
 *
 * parseCapabilityString('Post|update|{"authorId":"${user.id}"}|title,body')
 * // → { subject: 'Post', action: 'update', conditions: { authorId: '${user.id}' }, fields: ['title', 'body'] }
 *
 * parseCapabilityString('Post|read|*|title,body,status')
 * // → { subject: 'Post', action: 'read', fields: ['title', 'body', 'status'] }
 * ```
 */
export function parseCapabilityString(cap: CapabilityString): Capability {
  let str = cap.trim();
  let inverted = false;

  if (str.startsWith('!')) {
    inverted = true;
    str = str.slice(1);
  }

  const parts = str.split('|');
  if (parts.length > 5) {
    throw new Error(`Invalid capability string: too many segments in "${cap}"`);
  }
  const subject = decodeTextSegment(parts[0], cap, 'subject');
  const action = decodeTextSegment(parts[1], cap, 'action');

  if (!subject) {
    throw new Error(`Invalid capability string: missing subject in "${cap}"`);
  }
  if (!action) {
    throw new Error(`Invalid capability string: missing action in "${cap}"`);
  }

  const rawConditions = parts[2];
  const rawFields = parts[3];
  const rawReason = parts[4];

  let conditions: Record<string, unknown> | undefined;
  if (rawConditions && rawConditions !== '*') {
    let parsed: unknown;
    try {
      const json = rawConditions.startsWith('~')
        ? Buffer.from(rawConditions.slice(1), 'base64url').toString('utf8')
        : rawConditions;
      parsed = JSON.parse(json);
    } catch {
      throw new Error(
        `Invalid conditions JSON in capability string "${cap}": ${rawConditions}`,
      );
    }
    if (!isPlainObject(parsed)) {
      throw new TypeError(
        `Capability conditions must be a JSON object in "${cap}".`,
      );
    }
    conditions = parsed;
  }

  const result: Capability = { subject, action };
  if (inverted) result.inverted = true;
  if (conditions) result.conditions = conditions;
  if (rawFields && rawFields !== '*') {
    result.fields = decodeFieldsSegment(rawFields, cap);
  }
  if (rawReason !== undefined && rawReason !== '*') {
    result.reason = decodeTextSegment(rawReason, cap, 'reason');
  }

  return result;
}

/**
 * Normalize a capability — whether it arrives as a {@link Capability} object
 * or as a compact {@link CapabilityString} (for example from a JWT or cookie) —
 * into a structured {@link Capability}.
 */
export function normalizeCapability(
  cap: Capability | CapabilityString,
): Capability {
  if (typeof cap === 'string') return parseCapabilityString(cap);
  if (!isPlainObject(cap)) {
    throw new TypeError('Capability must be an object or compact string.');
  }
  if (typeof cap.subject !== 'string' || cap.subject.length === 0) {
    throw new TypeError('Capability subject must be a non-empty string.');
  }
  if (typeof cap.action !== 'string' || cap.action.length === 0) {
    throw new TypeError('Capability action must be a non-empty string.');
  }
  if (cap.conditions !== undefined && !isPlainObject(cap.conditions)) {
    throw new TypeError('Capability conditions must be a JSON object.');
  }
  if (
    cap.fields !== undefined &&
    (!Array.isArray(cap.fields) ||
      cap.fields.some((field) => typeof field !== 'string'))
  ) {
    throw new TypeError('Capability fields must be an array of strings.');
  }
  if (cap.inverted !== undefined && typeof cap.inverted !== 'boolean') {
    throw new TypeError('Capability inverted must be a boolean.');
  }
  if (cap.reason !== undefined && typeof cap.reason !== 'string') {
    throw new TypeError('Capability reason must be a string.');
  }
  return cap;
}

/**
 * Collapse a {@link Capability} into a compact {@link CapabilityString}
 * suitable for JWT claims, encrypted cookies, or session stores where payload
 * size matters.
 *
 * This is a **runtime-only serialisation** step — the inverse of
 * {@link parseCapabilityString}.
 *
 * The fields segment is appended when the capability restricts specific
 * fields, or as `*` when a reason segment follows it; otherwise it is omitted,
 * keeping the string compact for the common case.
 *
 * @example
 * ```ts
 * serializeCapability({ subject: 'Post', action: 'manage' })
 * // → 'Post|manage|*'
 *
 * serializeCapability({ subject: 'all', action: 'manage' })
 * // → 'all|manage|*'
 *
 * serializeCapability({ subject: 'Post', action: 'update', fields: ['title', 'body'] })
 * // → 'Post|update|*|title,body'
 *
 * serializeCapability({ subject: 'Post', action: 'update', conditions: { authorId: 42 }, fields: ['title'] })
 * // → 'Post|update|{"authorId":42}|title'
 * ```
 */
export function serializeCapability(cap: Capability): CapabilityString {
  const normalized = normalizeCapability(cap);
  const prefix = normalized.inverted ? '!' : '';
  const subject = encodeTextSegment(normalized.subject, true);
  const action = encodeTextSegment(normalized.action);

  let conditionsJson: string | undefined;
  if (normalized.conditions !== undefined) {
    try {
      conditionsJson = JSON.stringify(
        copyJsonConditions(normalized.conditions),
      );
    } catch {
      throw new TypeError('Capability conditions must be a JSON object.');
    }
  }

  const conditions =
    conditionsJson?.includes('|') === true
      ? `~${Buffer.from(conditionsJson, 'utf8').toString('base64url')}`
      : (conditionsJson ?? '*');
  const fields = encodeFieldsSegment(normalized.fields);
  const reason =
    normalized.reason !== undefined
      ? encodeTextSegment(normalized.reason, false, true)
      : undefined;

  const base = `${prefix}${subject}|${action}|${conditions}`;
  if (reason !== undefined) return `${base}|${fields ?? '*'}|${reason}`;
  return fields !== undefined ? `${base}|${fields}` : base;
}

/** Copy only lossless JSON data, without invoking getters or toJSON hooks. */
function copyJsonConditions(
  value: unknown,
  ancestors = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    typeof value !== 'object' ||
    value === null ||
    (!Array.isArray(value) && !isPlainObject(value)) ||
    ancestors.has(value)
  ) {
    throw new TypeError('Unsupported condition value.');
  }

  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (Array.isArray(value)) {
      // Arrays must have exactly their length property and contiguous indices.
      if (keys.length !== value.length + 1)
        throw new TypeError('Lossy condition array.');
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw new TypeError('Condition arrays must contain only JSON data.');
        }
        result.push(copyJsonConditions(descriptor.value, ancestors));
      }
      return result;
    }

    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      if (typeof key !== 'string')
        throw new TypeError('Symbol condition keys are unsupported.');
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError(
          'Conditions must contain only enumerable JSON data.',
        );
      }
      result[key] = copyJsonConditions(descriptor.value, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function encodeTextSegment(
  value: string,
  escapeBang = false,
  escapeStar = false,
): string {
  const needsEncoding =
    value.startsWith('~') ||
    value.includes('|') ||
    value.trim() !== value ||
    (escapeBang && value.startsWith('!')) ||
    (escapeStar && value === '*');
  return needsEncoding
    ? `~${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`
    : value;
}

function decodeTextSegment(
  value: string | undefined,
  capability: string,
  label: string,
): string {
  if (!value?.startsWith('~')) return value ?? '';
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value.slice(1), 'base64url').toString('utf8'),
    );
    if (typeof decoded !== 'string') throw new TypeError();
    return decoded;
  } catch {
    throw new Error(
      `Invalid encoded ${label} in capability string "${capability}".`,
    );
  }
}

function encodeFieldsSegment(fields: string[] | undefined): string | undefined {
  if (fields === undefined) return undefined;
  const safe =
    fields.length > 0 &&
    fields.every(
      (field) =>
        field.length > 0 &&
        field !== '*' &&
        !field.startsWith('~') &&
        !field.includes(',') &&
        !field.includes('|') &&
        field.trim() === field,
    );
  return safe
    ? fields.join(',')
    : `~${Buffer.from(JSON.stringify(fields), 'utf8').toString('base64url')}`;
}

function decodeFieldsSegment(value: string, capability: string): string[] {
  if (!value.startsWith('~')) return value.split(',');
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value.slice(1), 'base64url').toString('utf8'),
    );
    if (
      !Array.isArray(decoded) ||
      decoded.some((field) => typeof field !== 'string')
    ) {
      throw new TypeError();
    }
    return decoded;
  } catch {
    throw new Error(
      `Invalid encoded fields in capability string "${capability}".`,
    );
  }
}

/** True for a non-null object whose prototype is `Object.prototype` or `null`. */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
