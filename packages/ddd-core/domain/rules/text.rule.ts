/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { assertField, violationThrower } from './rule-support';
import type { ValueViolationError } from './value-violation';

/** Options of {@link textRule}. */
export interface TextRuleOptions {
  /** Field name reported in the violation and in the default message. */
  readonly field: string;
  /**
   * `false` accepts `null`, `undefined` and blank text, and normalizes them
   * to `null`. Defaults to `true`: they are a `required` violation.
   */
  readonly required?: boolean;
  /**
   * Fewest characters after normalization, counted in UTF-16 code units like
   * `String.length` and Zod's `.min()`.
   */
  readonly minLength?: number;
  /**
   * Most characters after normalization, counted like {@link minLength}. A
   * column limit counted in code points, such as `varchar(n)`, is never
   * exceeded by a value within it.
   */
  readonly maxLength?: number;
  /**
   * Pattern the normalized text must match. A `g` or `y` flag is rejected,
   * because `test()` would then depend on the previous call.
   */
  readonly pattern?: RegExp;
  /**
   * `true` accepts tab, line feed and carriage return inside the text.
   * Defaults to `false`: they are a `characters` violation.
   */
  readonly multiline?: boolean;
  /**
   * Builds the error thrown for a violation. Defaults to
   * `InvalidValueException`.
   */
  readonly error?: ValueViolationError;
}

/** What {@link TextRule.parse} returns: `string | null` when not required. */
export type TextRuleValue<TOptions extends TextRuleOptions> = TOptions extends {
  readonly required: true;
}
  ? string
  : TOptions extends { readonly required: boolean }
    ? string | null
    : string;

/** A text rule: its options, frozen, and the parser that enforces them. */
export type TextRule<TOptions extends TextRuleOptions = TextRuleOptions> =
  Readonly<TOptions> & {
    /**
     * Returns the value in Unicode NFC form and trimmed, or `null` for blank
     * text the rule does not require. A standalone function: pass it without
     * binding.
     *
     * @throws The `error` option's result, by default `InvalidValueException`.
     */
    readonly parse: (value: unknown) => TextRuleValue<TOptions>;
  };

const CONTROL_CHARACTER = /\p{Cc}/u;
const CONTROL_CHARACTER_EXCEPT_LINE_BREAK = /(?![\t\n\r])\p{Cc}/u;
const UNPAIRED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function assertLength(name: string, value: number | undefined): void {
  if (value !== undefined && !(Number.isSafeInteger(value) && value >= 0)) {
    throw new TypeError(`textRule: ${name} must be a non-negative integer.`);
  }
}

/**
 * Defines the rule for one text field of an aggregate: declared once, used by
 * the aggregate to parse the value, and read by other layers (such as a
 * request schema) for its limits.
 *
 * `parse(value)` checks, in this order:
 * 1. `null` or `undefined`: `null`, or a `required` violation;
 * 2. not a string: a `type` violation;
 * 3. an unpaired surrogate: a `characters` violation, since it cannot be
 *    stored as UTF-8;
 * 4. Unicode NFC normalization, then trimming; blank text is `null`, or a
 *    `required` violation;
 * 5. a control character (tab and line breaks too, unless `multiline`): a
 *    `characters` violation;
 * 6. `minLength`, `maxLength`, then `pattern`.
 *
 * @param options - The field name, its constraints and its error.
 * @returns The frozen rule.
 * @throws TypeError when an option is invalid: an empty `field`, a length
 *   that is not a non-negative integer, `minLength` above `maxLength`, or a
 *   `pattern` with a `g` or `y` flag.
 *
 * @example
 * ```ts
 * export class User extends RootEntity<UserSnapshot> {
 *   static readonly rules = {
 *     username: textRule({
 *       field: 'username',
 *       minLength: 3,
 *       maxLength: 255,
 *       error: (violation) => new InvalidUsernameException(violation),
 *     }),
 *   } as const;
 *
 *   @Mutable<string>({ normalize: (value) => User.rules.username.parse(value) })
 *   private _username: string;
 * }
 *
 * User.rules.username.parse('  Ana María  '); // 'Ana María'
 * z.string().trim().min(User.rules.username.minLength); // a request schema
 * ```
 */
export function textRule<const TOptions extends TextRuleOptions>(
  options: TOptions,
): TextRule<TOptions> {
  assertField(options.field, 'textRule');
  assertLength('minLength', options.minLength);
  assertLength('maxLength', options.maxLength);
  const {
    field,
    required = true,
    minLength,
    maxLength,
    pattern,
    multiline = false,
  } = options;
  if (
    minLength !== undefined &&
    maxLength !== undefined &&
    minLength > maxLength
  ) {
    throw new TypeError('textRule: minLength must not exceed maxLength.');
  }
  if (pattern !== undefined && (pattern.global || pattern.sticky)) {
    throw new TypeError('textRule: pattern must not use the g or y flag.');
  }

  const fail = violationThrower(options.error);
  const controlCharacter = multiline
    ? CONTROL_CHARACTER_EXCEPT_LINE_BREAK
    : CONTROL_CHARACTER;

  const parse = (value: unknown): string | null => {
    if (value === null || value === undefined) {
      return required ? fail({ field, rule: 'required' }) : null;
    }
    if (typeof value !== 'string') {
      return fail({ field, rule: 'type', expected: 'string' });
    }
    if (UNPAIRED_SURROGATE.test(value)) {
      return fail({ field, rule: 'characters' });
    }
    const text = value.normalize('NFC').trim();
    if (text.length === 0) {
      return required ? fail({ field, rule: 'required' }) : null;
    }
    if (controlCharacter.test(text)) {
      return fail({ field, rule: 'characters' });
    }
    if (minLength !== undefined && text.length < minLength) {
      return fail({ field, rule: 'minLength', limit: minLength });
    }
    if (maxLength !== undefined && text.length > maxLength) {
      return fail({ field, rule: 'maxLength', limit: maxLength });
    }
    if (pattern !== undefined && !pattern.test(text)) {
      return fail({ field, rule: 'pattern' });
    }
    return text;
  };

  return Object.freeze({ ...options, parse }) as TextRule<TOptions>;
}
