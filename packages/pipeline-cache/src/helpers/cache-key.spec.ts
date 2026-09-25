/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { MissingCachePartitionError } from '../errors/missing-partition.error';
import { createPartitionedCacheKeyFactory } from './cache-key';

function makeContext(
  overrides: Partial<IPipelineContext> = {},
): IPipelineContext {
  return {
    correlationId: 'corr-1',
    tenantId: 'tenant-a',
    request: { id: 1 },
    requestType: class GetUserQuery {},
    requestName: 'GetUserQuery',
    handlerType: class GetUserHandler {},
    handlerName: 'GetUserHandler',
    requestKind: 'query',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map<string | symbol, unknown>([['userId', 'user-7']]),
    getBehaviorOptions: () => undefined,
    ...overrides,
  } as unknown as IPipelineContext;
}

const readUserId = (ctx: IPipelineContext) =>
  ctx.items.get('userId') as string | undefined;

const factory = createPartitionedCacheKeyFactory({
  principal: readUserId,
  requireScope: false,
});

describe('createPartitionedCacheKeyFactory', () => {
  it('produces the same key for the same caller and payload across requests', () => {
    // A key that varied per request, such as one built from the correlation ID,
    // could never produce a hit.
    expect(factory(makeContext({ correlationId: 'request-a' }))).toBe(
      factory(makeContext({ correlationId: 'request-b' })),
    );
  });

  it('is stable regardless of payload property order', () => {
    expect(factory(makeContext({ request: { a: 1, b: 2 } }))).toBe(
      factory(makeContext({ request: { b: 2, a: 1 } })),
    );
  });

  it('separates different payloads, request names and tenants', () => {
    expect(factory(makeContext({ request: { id: 1 } }))).not.toBe(
      factory(makeContext({ request: { id: 2 } })),
    );
    expect(factory(makeContext({ requestName: 'GetUserQuery' }))).not.toBe(
      factory(makeContext({ requestName: 'GetUsersQuery' })),
    );
    expect(factory(makeContext({ tenantId: 'tenant-a' }))).not.toBe(
      factory(makeContext({ tenantId: 'tenant-b' })),
    );
  });

  it('separates principals, so one caller cannot replay another authorized response', () => {
    expect(
      factory(makeContext({ items: new Map([['userId', 'alice']]) })),
    ).not.toBe(factory(makeContext({ items: new Map([['userId', 'bob']]) })));
  });

  it('keeps the payload out of the key', () => {
    const key = factory(
      makeContext({ request: { email: 'secret@example.test' } }),
    );

    expect(key).not.toContain('secret@example.test');
    expect(key).toMatch(/:[0-9a-f]{64}$/);
  });

  it('separates permission scopes when a scope resolver is supplied', () => {
    // Without this, a principal whose roles were revoked keeps reading the
    // response computed under the old permissions until the entry expires.
    const scoped = createPartitionedCacheKeyFactory({
      principal: readUserId,
      scope: (ctx) => ctx.items.get('capabilityVersion') as string | undefined,
    });

    const before = scoped(
      makeContext({
        items: new Map([
          ['userId', 'alice'],
          ['capabilityVersion', 'v1'],
        ]),
      }),
    );
    const after = scoped(
      makeContext({
        items: new Map([
          ['userId', 'alice'],
          ['capabilityVersion', 'v2'],
        ]),
      }),
    );

    expect(before).not.toBe(after);
  });

  it('ignores the correlation ID entirely', () => {
    const a = factory(makeContext({ correlationId: 'x' }));
    const b = factory(makeContext({ correlationId: 'y' }));

    expect(a).toBe(b);
    expect(a).not.toContain('x');
  });

  describe('required dimensions', () => {
    it('fails closed without a tenant', () => {
      expect(() => factory(makeContext({ tenantId: undefined }))).toThrow(
        MissingCachePartitionError,
      );
    });

    it('fails closed without a principal', () => {
      // A hit skips the handler, and with it the entity-level authorization the
      // handler performs. An unpartitioned key is a replay channel.
      expect(() => factory(makeContext({ items: new Map() }))).toThrow(
        /requires a principal partition/,
      );
    });

    it('allows both to be waived for genuinely public responses', () => {
      const publicKey = createPartitionedCacheKeyFactory({
        principal: () => 'public',
        requirePrincipal: false,
        requireTenant: false,
        requireScope: false,
      });

      expect(
        publicKey(makeContext({ tenantId: undefined, items: new Map() })),
      ).toBe(publicKey(makeContext({ tenantId: undefined, items: new Map() })));
    });

    it('handles falsy principal when requirePrincipal is false', () => {
      const unauthKey = createPartitionedCacheKeyFactory({
        principal: () => undefined,
        requirePrincipal: false,
        requireTenant: false,
        requireScope: false,
      });

      expect(
        unauthKey(makeContext({ tenantId: undefined, items: new Map() })),
      ).toContain('cache:v3:\\-:\\-:\\-:GetUserQuery');
    });

    it('fails closed when scope is required but absent', () => {
      const requireScopeKey = createPartitionedCacheKeyFactory({
        principal: readUserId,
        scope: () => undefined,
        requireScope: true,
      });

      expect(() => requireScopeKey(makeContext())).toThrow(
        MissingCachePartitionError,
      );
      expect(() => requireScopeKey(makeContext())).toThrow(
        /requires a scope partition/,
      );
    });

    it('succeeds when scope is required and present', () => {
      const requireScopeKey = createPartitionedCacheKeyFactory({
        principal: readUserId,
        scope: () => 'v2:scope-hash',
        requireScope: true,
      });

      expect(requireScopeKey(makeContext())).toContain('scope-hash');
    });
  });

  describe('delimiter safety', () => {
    it('keeps a tenant containing a separator distinct from a principal containing one', () => {
      expect(
        factory(
          makeContext({
            tenantId: 'a:b',
            items: new Map([['userId', 'c']]),
          }),
        ),
      ).not.toBe(
        factory(
          makeContext({
            tenantId: 'a',
            items: new Map([['userId', 'b:c']]),
          }),
        ),
      );
    });

    it('requires a scope resolver unless requireScope is false', () => {
      expect(() =>
        createPartitionedCacheKeyFactory({ principal: readUserId }),
      ).toThrow(/requires a `scope` resolver/);
    });

    it('rejects an unresolved scope by default', () => {
      const scoped = createPartitionedCacheKeyFactory({
        principal: readUserId,
        scope: () => undefined,
      });

      expect(() => scoped(makeContext())).toThrow(MissingCachePartitionError);
    });

    it('distinguishes an absent scope from a literal one', () => {
      const scoped = createPartitionedCacheKeyFactory({
        principal: readUserId,
        scope: (ctx) => ctx.items.get('scope') as string | undefined,
        requireScope: false,
      });

      const absent = scoped(makeContext({ items: new Map([['userId', 'a']]) }));
      const present = scoped(
        makeContext({
          items: new Map([
            ['userId', 'a'],
            ['scope', 'v1'],
          ]),
        }),
      );

      expect(absent).not.toBe(present);
    });
  });
});
