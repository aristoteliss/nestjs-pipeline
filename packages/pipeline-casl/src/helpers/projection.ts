/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { AppAbility } from '../types/casl.types';

type FieldRule = ReturnType<AppAbility['relevantRuleFor']>;
const OMIT = Symbol('unreadable-field');

/**
 * Projects a snapshot to the fields `ability` permits for `action`. Conditions
 * are evaluated against the full subject. A granted parent path authorizes its
 * descendants unless a descendant is explicitly denied; this differs from
 * `ability.can(action, subject, 'parent.child')`, which needs
 * `parent.*`/`parent.**`. Denied array elements become `null`. Cyclic input
 * and more than 1024 path aliases throw.
 */
export function projectPermittedFields(
  ability: AppAbility,
  action: string,
  typedSubject: string,
  record: Record<string, unknown> | unknown[],
): Record<string, unknown> | unknown[] {
  const ancestors = new WeakSet<object>();

  // Evaluate full field paths using CASL. Conditions use the complete subject.
  function ruleFor(paths: string[], inherited: FieldRule): FieldRule {
    let rule: FieldRule = null;
    for (const field of paths) {
      if (!field) continue;
      const candidate = ability.relevantRuleFor(action, typedSubject, field);
      if (candidate) {
        if (candidate.inverted) {
          if (!rule?.inverted || candidate.priority < rule.priority) {
            rule = candidate;
          }
        } else if (
          !rule ||
          (!rule.inverted && candidate.priority < rule.priority)
        ) {
          rule = candidate;
        }
      }
    }

    // A direct leaf denial always takes precedence over an inherited grant.
    if (rule?.inverted) {
      return rule;
    }

    // Parent denials can mask containers unless explicitly overridden.
    if (inherited?.inverted && (!rule || inherited.priority < rule.priority)) {
      return inherited;
    }

    if (rule) {
      return rule;
    }

    // Inherit parent grant for descendants that are not explicitly denied.
    if (inherited && !inherited.inverted) {
      return inherited;
    }

    return null;
  }

  function project(
    value: unknown,
    paths: string[],
    inherited: FieldRule,
  ): unknown {
    const rule = ruleFor(paths, inherited);
    const allowed = !!rule && !rule.inverted;
    if (value === null || typeof value !== 'object' || value instanceof Date) {
      return allowed ? value : OMIT;
    }

    if (ancestors.has(value)) {
      throw new TypeError('Cannot project a cyclic authorization snapshot.');
    }
    ancestors.add(value);
    try {
      const toJSON = (value as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === 'function') {
        return project(toJSON.call(value), paths, rule);
      }
      if (Array.isArray(value)) {
        if (value.length === 0) return allowed ? [] : OMIT;
        let visible = false;
        const result = value.map((item, index) => {
          // Named paths apply to every element; indexed paths can additionally
          // restrict individual elements. Keep positions stable after masking.
          const elementPaths = [
            ...new Set([
              ...paths,
              ...paths.map((path) =>
                path ? `${path}.${index}` : String(index),
              ),
            ]),
          ];
          // Nested arrays have both named and indexed aliases. Bound their
          // combinations so pathological input fails closed instead of exploding.
          if (elementPaths.length > 1024) {
            throw new TypeError(
              'Authorization snapshot has too many array path aliases.',
            );
          }
          const projected = project(item, elementPaths, rule);
          if (projected !== OMIT) visible = true;
          return projected === OMIT ? null : projected;
        });
        return visible ? result : OMIT;
      }

      const entries = Object.entries(value);
      if (entries.length === 0) return allowed ? {} : OMIT;
      const result: Record<string, unknown> = {};
      for (const [key, child] of entries) {
        const projected = project(
          child,
          paths.map((path) => (path ? `${path}.${key}` : key)),
          rule,
        );
        if (projected !== OMIT) {
          Object.defineProperty(result, key, {
            value: projected,
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
      }
      return Object.keys(result).length > 0 ? result : OMIT;
    } finally {
      ancestors.delete(value);
    }
  }

  if (Array.isArray(record)) {
    ancestors.add(record);
    try {
      return record.map((item, index) => {
        // The empty path gives named fields the same meaning for every item.
        const projected = project(item, ['', String(index)], null);
        return projected === OMIT ? null : projected;
      });
    } finally {
      ancestors.delete(record);
    }
  }

  const result: Record<string, unknown> = {};
  ancestors.add(record);
  try {
    for (const [key, value] of Object.entries(record)) {
      const projected = project(value, [key], null);
      if (projected !== OMIT) {
        Object.defineProperty(result, key, {
          value: projected,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    return result;
  } finally {
    ancestors.delete(record);
  }
}
