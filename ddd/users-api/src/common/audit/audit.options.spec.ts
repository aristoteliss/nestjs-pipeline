/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { sessionUserStore } from '@common/context/session-user.store';
import { type AuditBehaviorOptions, audit } from '@nestjs-pipeline/audit';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_MODULE_DEFAULTS,
  sessionAuditActor,
  UNAUTHENTICATED_AUDIT_ACTOR,
} from './audit.options';

describe('sessionAuditActor', () => {
  it('resolves actor from active session user', () => {
    sessionUserStore.run(
      {
        id: 'user-1',
        tenant: 'tenant-a',
        principalType: 'user',
        email: 'user@test.com',
      },
      () => {
        const actor = sessionAuditActor();
        expect(actor).toEqual({
          id: 'user-1',
          authenticated: true,
          principalType: 'user',
          email: 'user@test.com',
        });
      },
    );
  });

  it('returns unauthenticated actor when session store is empty', () => {
    const actor = sessionAuditActor();
    expect(actor).toEqual(UNAUTHENTICATED_AUDIT_ACTOR);
    expect(actor.id).toBeUndefined();
    expect(actor.authenticated).toBe(false);
  });

  it('provides actor resolver in module defaults', () => {
    expect(AUDIT_MODULE_DEFAULTS.actor).toBe(sessionAuditActor);
  });
});

describe('Audit option typing', () => {
  it('rejects unknown options like metadataFactory at compile time', () => {
    const invalidOptions: AuditBehaviorOptions = {
      action: 'test',
      // @ts-expect-error metadataFactory is not a valid AuditBehaviorOptions property
      metadataFactory: () => ({}),
    };
    expect(invalidOptions).toBeDefined();

    const invalidIntent = audit({
      action: 'test',
      // @ts-expect-error metadataFactory is rejected by audit intent builder
      metadataFactory: () => ({}),
    });
    expect(invalidIntent).toBeDefined();
  });
});
