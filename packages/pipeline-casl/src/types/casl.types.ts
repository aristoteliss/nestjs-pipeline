/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { MongoAbility, RawRuleOf } from '@casl/ability';

/** One permission rule. `conditions` may contain `${user.<path>}` placeholders. */
export interface Capability {
  subject: string;
  action: string;
  conditions?: Record<string, unknown>;
  fields?: string[];
  inverted?: boolean;
  reason?: string;
}

/** Compact form: `[!]subject|action[|conditions[|fields[|reason]]]`. */
export type CapabilityString = string;

/** A type-level permission requirement checked by `CaslBehavior`. */
export interface AbilityRequirement {
  action: string;
  subject: string;
  field?: string;
}

export type AppAbility = MongoAbility<[string, string]>;
export type AppRawRule = RawRuleOf<AppAbility>;

/** A candidate after field projection: every property may be absent; denied array items become null. */
export type Projected<T> = T extends Date
  ? T
  : T extends readonly (infer U)[]
    ? (Projected<U> | null)[]
    : T extends object
      ? { [K in keyof T]?: Projected<T[K]> }
      : T;
