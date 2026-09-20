/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createMongoAbility } from '@casl/ability';
import type { CaslPrincipal } from '../interfaces/permission-source.interface';
import type {
  AppAbility,
  AppRawRule,
  Capability,
  CapabilityString,
} from '../types/casl.types';
import { isPlainObject, normalizeCapability } from './capability';

/**
 * Builds the ability for one caller. Every direct rule precedes every inverted
 * rule (stable within each group), so a deny from any source wins over an allow.
 * Placeholders resolve against `principal`; a missing attribute throws.
 *
 * @throws {TypeError} For a malformed capability or an allow rule with an
 *   empty `fields` list.
 *
 * @example
 * ```ts
 * const ability = buildAbility(
 *   ['User|read|{"department":"${user.department}"}', '!User|read|*|email'],
 *   { id: 'u-1', department: 'engineering' },
 * );
 * ```
 */
export function buildAbility(
  rules: readonly (Capability | CapabilityString)[],
  principal?: CaslPrincipal,
): AppAbility {
  const normalized = rules.map(normalizeCapability);
  const ordered = [
    ...normalized.filter((rule) => !rule.inverted),
    ...normalized.filter((rule) => rule.inverted),
  ];
  return createMongoAbility<[string, string]>(
    ordered.map((rule) => toRawRule(rule, principal)),
  );
}

/**
 * Resolve template placeholders in a {@link Capability}'s `conditions` column
 * against the current {@link CaslPrincipal}.
 *
 * Conditions are stored in the database with placeholders like `${user.id}` or
 * `${user.tenantId}` (or `{{ property }}` syntax). At runtime, before CASL can
 * evaluate the rule, this function replaces each placeholder with the real
 * value from the authenticated principal.
 *
 * Supports nested property access via dot notation (e.g. `${address.city}`).
 *
 * A placeholder that cannot be resolved against the principal throws,
 * rather than collapsing to an empty string. This fails closed: a condition
 * such as `{ department: '${department}' }` can never silently become
 * `{ department: '' }` and match unintended records.
 *
 * @throws {Error} When a placeholder references a property absent from the
 *   principal.
 *
 * @example
 * ```ts
 * interpolateConditions({ authorId: '${user.id}' }, { id: 'u-1' })
 * // → { authorId: 'u-1' }
 *
 * interpolateConditions({ level: '${level}' }, { id: 'u-1', level: 3 })
 * // → { level: 3 }
 * ```
 */
export function interpolateConditions(
  conditions: Record<string, unknown>,
  principal: CaslPrincipal,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(conditions).map(([key, value]) => [
      key,
      interpolateValue(value, principal, key),
    ]),
  );
}

function interpolateValue(
  value: unknown,
  principal: CaslPrincipal,
  conditionPath: string,
): unknown {
  if (typeof value === 'string') {
    // If the entire string is a single placeholder, preserve the resolved
    // value's original type (e.g. a numeric id stays a number).
    if (/^(\$\{[^}]+\}|\{\{\s*[^}]+?\s*\}\})$/.test(value)) {
      const prop = value.replace(/^\$\{|\}$|^\{\{\s*|\s*\}\}$/g, '').trim();
      return resolvePlaceholder(principal, prop, conditionPath);
    }

    return value.replace(
      /\$\{([^}]+)\}|\{\{\s*([^}]+?)\s*\}\}/g,
      (_, p1: string | undefined, p2: string | undefined) => {
        const prop = (p1 ?? p2 ?? '').trim();
        return String(resolvePlaceholder(principal, prop, conditionPath));
      },
    );
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      interpolateValue(item, principal, `${conditionPath}[${index}]`),
    );
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        interpolateValue(nested, principal, `${conditionPath}.${key}`),
      ]),
    );
  }

  return value;
}

function resolvePlaceholder(
  principal: CaslPrincipal,
  path: string,
  conditionPath: string,
): unknown {
  const resolved = getNestedValue(principal, path);
  if (typeof resolved === 'undefined') {
    throw new Error(
      `Cannot interpolate capability condition "${conditionPath}": property "${path}" is missing from the principal.`,
    );
  }
  return resolved;
}

function getNestedValue(obj: CaslPrincipal, path: string): unknown {
  const normalizedPath = path.startsWith('user.') ? path.slice(5) : path;
  const segments = normalizedPath.split('.').filter(Boolean);
  let current: unknown = obj;

  for (const seg of segments) {
    if (
      current !== null &&
      typeof current === 'object' &&
      Object.getOwnPropertyDescriptor(current, seg) !== undefined
    ) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }

  return current;
}

function toRawRule(
  capability: Capability,
  principal: CaslPrincipal | undefined,
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

  if (capability.fields?.length === 0 && !capability.inverted) {
    throw new TypeError(
      'Allow capability has an empty fields list, which would grant no fields. ' +
        'Omit fields for unrestricted access.',
    );
  }
  if (capability.fields && capability.fields.length > 0) {
    rule.fields = capability.fields;
  }

  if (capability.conditions) {
    rule.conditions = principal
      ? interpolateConditions(capability.conditions, principal)
      : capability.conditions;
  }

  return rule;
}
