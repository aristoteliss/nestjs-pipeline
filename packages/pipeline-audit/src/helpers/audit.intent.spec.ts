/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { AuditBehavior } from '../audit.behavior';
import { type AuditIntentOptions, audit } from './audit.intent';

describe('audit intent builder', () => {
  it('creates entry with options object', () => {
    const entry = audit({ action: 'user.delete', severity: 'high' });
    expect(entry[0]).toBe(AuditBehavior);
    expect(entry[1]).toEqual({ action: 'user.delete', severity: 'high' });
  });

  it('creates entry with empty options', () => {
    const entry = audit();
    expect(entry[0]).toBe(AuditBehavior);
    expect(entry[1]).toEqual({});
  });

  it('validates options type compatibility', () => {
    expectTypeOf(audit).toBeFunction();
    expectTypeOf<{ unknownProp: string }>().not.toExtend<AuditIntentOptions>();
  });
});
