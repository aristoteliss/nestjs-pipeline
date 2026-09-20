/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { sessionUserStore } from '@common/context/session-user.store';
import { type AuditBehaviorOptions, audit } from '@nestjs-pipeline/audit';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_MODULE_DEFAULTS,
  claimedIdentityActor,
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

  it('records a pre-authentication claim without an actor identity', () => {
    const actor = claimedIdentityActor('attacker@evil.test');

    expect(actor).toEqual({
      authenticated: false,
      claimedEmail: 'attacker@evil.test',
    });
    expect(actor).not.toHaveProperty('id');
  });

  it('omits the claim rather than fabricating one when no identity is supplied', () => {
    expect(claimedIdentityActor(undefined)).toEqual({ authenticated: false });
    expect(claimedIdentityActor('')).toEqual({ authenticated: false });
  });

  it('does not mutate the shared unauthenticated actor when adding a claim', () => {
    claimedIdentityActor('someone@corp.test');

    expect(UNAUTHENTICATED_AUDIT_ACTOR).toEqual({ authenticated: false });
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
