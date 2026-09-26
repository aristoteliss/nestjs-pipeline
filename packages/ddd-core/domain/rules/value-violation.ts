/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The rule a value broke, as reported by {@link textRule} and
 * {@link numberRule}. `field` is the rule's field name; `limit` is the
 * configured bound of a length or range rule.
 *
 * | `rule` | Broken when the value |
 * |---|---|
 * | `required` | is `null`, `undefined` or blank, and the rule requires it |
 * | `type` | is not a string (`textRule`) or not a number (`numberRule`) |
 * | `characters` | contains a control character or an unpaired surrogate |
 * | `minLength`, `maxLength` | is shorter or longer than `limit` |
 * | `pattern` | does not match the rule's pattern |
 * | `finite` | is `NaN` or infinite |
 * | `integer` | is not a safe integer |
 * | `min`, `max` | is below or above `limit` |
 */
export type ValueViolation =
  | { readonly field: string; readonly rule: 'required' }
  | {
      readonly field: string;
      readonly rule: 'type';
      readonly expected: 'string' | 'number';
    }
  | { readonly field: string; readonly rule: 'characters' }
  | {
      readonly field: string;
      readonly rule: 'minLength' | 'maxLength';
      readonly limit: number;
    }
  | { readonly field: string; readonly rule: 'pattern' }
  | { readonly field: string; readonly rule: 'finite' | 'integer' }
  | {
      readonly field: string;
      readonly rule: 'min' | 'max';
      readonly limit: number;
    };

/** Builds the error a rule throws for a violation. */
export type ValueViolationError = (violation: ValueViolation) => Error;
