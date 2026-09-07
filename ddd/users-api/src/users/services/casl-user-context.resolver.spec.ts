import type { QueryBus } from '@nestjs/cqrs';
import type { CaslUserContext } from '@nestjs-pipeline/casl';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { CaslUserContextResolver } from './casl-user-context.resolver';

describe('CaslUserContextResolver', () => {
  it('delegates database-user lookup through QueryBus and preserves resolved capabilities', async () => {
    const execute = vi.fn().mockResolvedValue({
      id: '019488e0-0000-7000-8000-000000000001',
      department: 'engineering',
    } satisfies CaslUserContext);
    const resolver = new CaslUserContextResolver(
      { execute } as unknown as QueryBus,
      ['sessionUser'],
    );
    const raw = {
      id: '019488e0-0000-7000-8000-000000000001',
      capabilities: { roles: ['admin'] },
    };
    const context = {
      request: { sessionUser: raw },
    } as unknown as IPipelineContext;

    await expect(resolver.resolve(context)).resolves.toMatchObject({
      id: raw.id,
      department: 'engineering',
      capabilities: raw.capabilities,
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('keeps non-database capability principals compatible without request scope', async () => {
    const execute = vi.fn().mockResolvedValue(null);
    const resolver = new CaslUserContextResolver(
      { execute } as unknown as QueryBus,
      ['sessionUser'],
    );
    const context = {
      request: {
        sessionUser: {
          id: 'service-admin',
          department: 'platform',
          capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
        },
      },
    } as unknown as IPipelineContext;

    await expect(resolver.resolve(context)).resolves.toMatchObject({
      id: 'service-admin',
      department: 'platform',
    });
  });

  it('rejects a missing persisted UUID principal exactly as before finding #9', async () => {
    const resolver = new CaslUserContextResolver(
      { execute: vi.fn().mockResolvedValue(null) } as unknown as QueryBus,
      ['sessionUser'],
    );
    const context = {
      request: {
        sessionUser: {
          id: '019488e0-0000-7000-8000-000000000001',
          capabilities: { roles: ['admin'] },
        },
      },
    } as unknown as IPipelineContext;

    await expect(resolver.resolve(context)).resolves.toBeNull();
  });
});
