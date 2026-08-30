/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type {
  AppRawRule,
  Capability,
  CapabilityString,
  CaslUserContext,
} from '../types/casl.types';

/**
 * Expand a compact {@link CapabilityString} (e.g. from a JWT or cookie) back
 * into a structured {@link Capability} that mirrors a database row.
 *
 * This is a **runtime-only deserialisation** step — the inverse of
 * {@link serializeCapability}.
 *
 * Format: `[!]subject|action[|conditions[|fields]]`
 *
 * - Prefix with `!` to create an inverted (deny) rule
 * - Use CASL's `all` for any subject and `manage` for any action
 * - `*` as conditions (or omitted) means no conditions
 * - `*` as fields (or omitted) means all fields
 * - Conditions remain readable JSON unless they contain `|`; those values are
 *   `~`-prefixed base64url JSON so segment parsing stays reversible
 * - Fields are comma-separated: `title,body,status`
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
  const subject = parts[0];
  const action = parts[1];

  if (!subject) {
    throw new Error(`Invalid capability string: missing subject in "${cap}"`);
  }
  if (!action) {
    throw new Error(`Invalid capability string: missing action in "${cap}"`);
  }

  const rawConditions = parts[2];
  const rawFields = parts[3];

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
    if (!isRecord(parsed)) {
      throw new TypeError(
        `Capability conditions must be a JSON object in "${cap}".`,
      );
    }
    conditions = parsed;
  }

  const result: Capability = { subject, action };
  if (inverted) result.inverted = true;
  if (conditions) result.conditions = conditions;
  if (rawFields && rawFields !== '*') result.fields = rawFields.split(',');

  return result;
}

/**
 * Normalize a capability — whether it arrives as a database-hydrated
 * {@link Capability} object or a compact {@link CapabilityString} from
 * a JWT / cookie — into a structured {@link Capability}.
 */
export function normalizeCapability(
  cap: Capability | CapabilityString,
): Capability {
  if (typeof cap === 'string') return parseCapabilityString(cap);
  if (!isRecord(cap)) {
    throw new TypeError('Capability must be an object or compact string.');
  }
  if (typeof cap.subject !== 'string' || cap.subject.length === 0) {
    throw new TypeError('Capability subject must be a non-empty string.');
  }
  if (typeof cap.action !== 'string' || cap.action.length === 0) {
    throw new TypeError('Capability action must be a non-empty string.');
  }
  if (cap.conditions !== undefined && !isRecord(cap.conditions)) {
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
  return cap;
}

/**
 * Collapse a {@link Capability} (typically loaded from the database) into a
 * compact {@link CapabilityString} suitable for JWT claims, encrypted cookies,
 * or session stores where payload size matters.
 *
 * This is a **runtime-only serialisation** step — the inverse of
 * {@link parseCapabilityString}.
 *
 * The fields segment is only appended when the capability restricts specific
 * fields, keeping the string compact for the common case.
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
  const prefix = cap.inverted ? '!' : '';
  const conditionsJson =
    cap.conditions && Object.keys(cap.conditions).length > 0
      ? JSON.stringify(cap.conditions)
      : undefined;
  const conditions =
    conditionsJson?.includes('|') === true
      ? `~${Buffer.from(conditionsJson, 'utf8').toString('base64url')}`
      : (conditionsJson ?? '*');
  const fields =
    cap.fields && cap.fields.length > 0 ? cap.fields.join(',') : undefined;

  const base = `${prefix}${cap.subject}|${cap.action}|${conditions}`;
  return fields ? `${base}|${fields}` : base;
}

/**
 * Resolve template placeholders in a {@link Capability}'s `conditions` column
 * against the current {@link CaslUserContext}.
 *
 * Conditions are stored in the database with placeholders like `${user.id}` or
 * `${user.tenantId}` (or `{{ property }}` syntax). At runtime, before CASL can
 * evaluate the rule, this function replaces each placeholder with the real
 * value from the authenticated user.
 *
 * Supports nested property access via dot notation (e.g. `${address.city}`).
 *
 * A placeholder that cannot be resolved against the user context throws,
 * rather than collapsing to an empty string. This fails closed: a condition
 * such as `{ department: '${department}' }` can never silently become
 * `{ department: '' }` and match unintended records.
 *
 * @throws {Error} When a placeholder references a property absent from the user
 *   context.
 *
 * @example
 * ```ts
 * interpolateConditions({ authorId: '${id}' }, { id: 42 })
 * // → { authorId: 42 }
 *
 * interpolateConditions({ tenantId: '${tenantId}' }, { id: 1, tenantId: 'abc' })
 * // → { tenantId: 'abc' }
 * ```
 */
export function interpolateConditions(
  conditions: Record<string, unknown>,
  user: CaslUserContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(conditions)) {
    result[key] = interpolateValue(value, user, key);
  }

  return result;
}

function interpolateValue(
  value: unknown,
  user: CaslUserContext,
  conditionPath: string,
): unknown {
  if (typeof value === 'string') {
    // If the entire string is a single placeholder, preserve the resolved
    // value's original type (e.g. a numeric id stays a number).
    if (/^(\$\{[^}]+\}|\{\{\s*[^}]+?\s*\}\})$/.test(value)) {
      const prop = value.replace(/^\$\{|\}$|^\{\{\s*|\s*\}\}$/g, '').trim();
      return resolvePlaceholder(user, prop, conditionPath);
    }

    return value.replace(
      /\$\{([^}]+)\}|\{\{\s*([^}]+?)\s*\}\}/g,
      (_, p1: string | undefined, p2: string | undefined) => {
        const prop = (p1 ?? p2 ?? '').trim();
        return String(resolvePlaceholder(user, prop, conditionPath));
      },
    );
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      interpolateValue(item, user, `${conditionPath}[${index}]`),
    );
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = interpolateValue(nested, user, `${conditionPath}.${key}`);
    }
    return result;
  }

  return value;
}

function resolvePlaceholder(
  user: CaslUserContext,
  path: string,
  conditionPath: string,
): unknown {
  const resolved = getNestedValue(user, path);
  if (typeof resolved === 'undefined') {
    throw new Error(
      `Cannot interpolate capability condition "${conditionPath}": property "${path}" is missing from the user context.`,
    );
  }
  return resolved;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const normalizedPath = path.startsWith('user.') ? path.slice(5) : path;
  const segments = normalizedPath.split('.').filter(Boolean);
  if (segments.length === 0) return undefined;

  return segments.reduce<unknown>((current, key) => {
    if (current !== null && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Convert a single {@link Capability} (database row) into the CASL
 * {@link AppRawRule} format that the CASL ability builder understands.
 *
 * If the capability's `conditions` contain template placeholders, they
 * are interpolated with the provided {@link CaslUserContext}.
 */
export function capabilityToRawRule(
  capability: Capability,
  user?: CaslUserContext | undefined,
): AppRawRule {
  const rule: AppRawRule = {
    action: capability.action,
    subject: capability.subject,
  };

  if (capability.inverted) {
    rule.inverted = true;
  }

  if (capability.reason) {
    rule.reason = capability.reason;
  }

  if (capability.fields && capability.fields.length > 0) {
    rule.fields = capability.fields;
  }

  if (capability.conditions) {
    rule.conditions = user
      ? interpolateConditions(capability.conditions, user)
      : capability.conditions;
  }

  return rule;
}

/**
 * Convert an array of capabilities (database rows or compact strings) into
 * CASL raw rules. Places direct (allow) rules first, then inverted (deny)
 * rules, following CASL's ordering convention so that denials correctly
 * override broader grants.
 *
 * Note: this orders rules **within a single list** only. When rules come from
 * several sources (multiple roles plus per-user additional/denied lists), the
 * cross-source ordering is re-applied by {@link buildAbility}, which globally
 * places every deny after every allow.
 */
export function capabilitiesToRawRules(
  capabilities: Array<Capability | CapabilityString>,
  user?: CaslUserContext | undefined,
): AppRawRule[] {
  const normalized = capabilities.map(normalizeCapability);

  // CASL convention: direct rules first, inverted rules after
  const direct = normalized.filter((c) => !c.inverted);
  const inverted = normalized.filter((c) => c.inverted);
  const ordered = [...direct, ...inverted];

  return ordered.map((cap) => capabilityToRawRule(cap, user));
}
