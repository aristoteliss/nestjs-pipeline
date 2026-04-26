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
 * - Fields are comma-separated: `title,body,status`
 *
 * @throws {Error} When the subject segment is empty or missing.
 * @throws {Error} When the action segment is empty or missing.
 * @throws {Error} When the conditions segment contains malformed JSON.
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
    try {
      conditions = JSON.parse(rawConditions) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Invalid conditions JSON in capability string "${cap}": ${rawConditions}`,
      );
    }
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
  return typeof cap === 'string' ? parseCapabilityString(cap) : cap;
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
  const conditions =
    cap.conditions && Object.keys(cap.conditions).length > 0
      ? JSON.stringify(cap.conditions)
      : '*';
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
    if (typeof value === 'string') {
      // Match ${property} or {{ property }} patterns
      const interpolated = value.replace(
        /\$\{([^}]+)\}|\{\{\s*([^}]+?)\s*\}\}/g,
        (_, p1: string | undefined, p2: string | undefined) => {
          const prop = (p1 ?? p2 ?? '').trim();
          const resolved = getNestedValue(user, prop);
          return String(resolved ?? '');
        },
      );

      // If the entire string was a single placeholder, preserve the original type
      if (/^(\$\{[^}]+\}|\{\{\s*[^}]+?\s*\}\})$/.test(value)) {
        const prop = value.replace(/^\$\{|\}$|^\{\{\s*|\s*\}\}$/g, '').trim();
        const resolved = getNestedValue(user, prop);
        result[key] = resolved ?? interpolated;
      } else {
        result[key] = interpolated;
      }
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = interpolateConditions(
        value as Record<string, unknown>,
        user,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.').filter(Boolean);

  for (let start = 0; start < segments.length; start++) {
    const resolved = segments.slice(start).reduce<unknown>((current, key) => {
      if (current !== null && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);

    if (typeof resolved !== 'undefined') {
      return resolved;
    }
  }

  return undefined;
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
  user?: CaslUserContext,
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
 */
export function capabilitiesToRawRules(
  capabilities: Array<Capability | CapabilityString>,
  user?: CaslUserContext,
): AppRawRule[] {
  const normalized = capabilities.map(normalizeCapability);

  // CASL convention: direct rules first, inverted rules after
  const direct = normalized.filter((c) => !c.inverted);
  const inverted = normalized.filter((c) => c.inverted);
  const ordered = [...direct, ...inverted];

  return ordered.map((cap) => capabilityToRawRule(cap, user));
}
