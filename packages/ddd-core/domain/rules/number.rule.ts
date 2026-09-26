/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { assertField, violationThrower } from './rule-support';
import type { ValueViolationError } from './value-violation';

/** Options of {@link numberRule}. */
export interface NumberRuleOptions {
  /** Field name reported in the violation and in the default message. */
  readonly field: string;
  /**
   * `false` accepts `null` and `undefined`, and normalizes them to `null`.
   * Defaults to `true`: they are a `required` violation.
   */
  readonly required?: boolean;
  /**
   * `true` accepts safe integers only (`Number.isSafeInteger`), so the value
   * survives a round trip through JSON and a `bigint` column.
   */
  readonly integer?: boolean;
  /** Smallest accepted value, inclusive. */
  readonly min?: number;
  /** Largest accepted value, inclusive. */
  readonly max?: number;
  /**
   * Builds the error thrown for a violation. Defaults to
   * `InvalidValueException`.
   */
  readonly error?: ValueViolationError;
}

/** What {@link NumberRule.parse} returns: `number | null` when not required. */
export type NumberRuleValue<TOptions extends NumberRuleOptions> =
  TOptions extends { readonly required: true }
    ? number
    : TOptions extends { readonly required: boolean }
      ? number | null
      : number;

/** A number rule: its options, frozen, and the parser that enforces them. */
export type NumberRule<TOptions extends NumberRuleOptions = NumberRuleOptions> =
  Readonly<TOptions> & {
    /**
     * Returns the value unchanged, or `null` for a missing value the rule
     * does not require. A standalone function: pass it without binding.
     *
     * @throws The `error` option's result, by default `InvalidValueException`.
     */
    readonly parse: (value: unknown) => NumberRuleValue<TOptions>;
  };

function assertBound(name: string, value: number | undefined): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new TypeError(`numberRule: ${name} must be a finite number.`);
  }
}

/**
 * Defines the rule for one number field of an aggregate: declared once, used
 * by the aggregate to parse the value, and read by other layers (such as a
 * request schema) for its limits.
 *
 * `parse(value)` checks, in this order:
 * 1. `null` or `undefined`: `null`, or a `required` violation;
 * 2. not a number: a `type` violation (a numeric string is not converted);
 * 3. `NaN` or an infinity: a `finite` violation;
 * 4. with `integer`, not a safe integer: an `integer` violation;
 * 5. `min`, then `max`.
 *
 * @param options - The field name, its constraints and its error.
 * @returns The frozen rule.
 * @throws TypeError when an option is invalid: an empty `field`, a bound that
 *   is not a finite number, or `min` above `max`.
 *
 * @example
 * ```ts
 * export class Order extends RootEntity<OrderSnapshot> {
 *   static readonly rules = {
 *     quantity: numberRule({
 *       field: 'quantity',
 *       integer: true,
 *       min: 1,
 *       max: 100,
 *       error: (violation) => new InvalidQuantityException(violation),
 *     }),
 *   } as const;
 *
 *   @Mutable<number>({ normalize: (value) => Order.rules.quantity.parse(value) })
 *   private _quantity: number;
 * }
 *
 * Order.rules.quantity.parse(0);
 * // throws InvalidQuantityException: "quantity must be at least 1."
 * ```
 */
export function numberRule<const TOptions extends NumberRuleOptions>(
  options: TOptions,
): NumberRule<TOptions> {
  assertField(options.field, 'numberRule');
  assertBound('min', options.min);
  assertBound('max', options.max);
  const { field, required = true, integer = false, min, max } = options;
  if (min !== undefined && max !== undefined && min > max) {
    throw new TypeError('numberRule: min must not exceed max.');
  }

  const fail = violationThrower(options.error);

  const parse = (value: unknown): number | null => {
    if (value === null || value === undefined) {
      return required ? fail({ field, rule: 'required' }) : null;
    }
    if (typeof value !== 'number') {
      return fail({ field, rule: 'type', expected: 'number' });
    }
    if (!Number.isFinite(value)) {
      return fail({ field, rule: 'finite' });
    }
    if (integer && !Number.isSafeInteger(value)) {
      return fail({ field, rule: 'integer' });
    }
    if (min !== undefined && value < min) {
      return fail({ field, rule: 'min', limit: min });
    }
    if (max !== undefined && value > max) {
      return fail({ field, rule: 'max', limit: max });
    }
    return value;
  };

  return Object.freeze({ ...options, parse }) as NumberRule<TOptions>;
}
