import type { QueryBus } from '@nestjs/cqrs';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { CaslUserContextResolver } from './casl-user-context.resolver';

function context(sessionUser: Record<string, unknown>): IPipelineContext {
  return { request: { sessionUser } } as unknown as IPipelineContext;
}

describe('CaslUserContextResolver principal discriminator', () => {
  it('looks up an explicit user principal regardless of whether its id is a UUID', async () => {
    const execute = vi.fn().mockResolvedValue({
      id: 'human-readable-user-id',
      department: 'engineering',
    });
    const resolver = new CaslUserContextResolver(
      { execute } as unknown as QueryBus,
      ['sessionUser'],
    );

    const result = await resolver.resolve(
      context({
        id: 'human-readable-user-id',
        principalType: 'user',
        capabilities: { roles: ['member'] },
      }),
    );

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: 'human-readable-user-id',
      department: 'engineering',
    });
  });

  it('accepts an explicit service principal even when its id looks like a UUID', async () => {
    const execute = vi.fn();
    const resolver = new CaslUserContextResolver(
      { execute } as unknown as QueryBus,
      ['sessionUser'],
    );
    const id = '019488e0-0000-7000-8000-000000000001';

    const result = await resolver.resolve(
      context({
        id,
        principalType: 'service',
        department: 'platform',
        capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
      }),
    );

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id, department: 'platform' });
  });

  it('rejects a missing persisted user even when the id is not a UUID', async () => {
    const execute = vi.fn().mockResolvedValue(null);
    const resolver = new CaslUserContextResolver(
      { execute } as unknown as QueryBus,
      ['sessionUser'],
    );

    await expect(
      resolver.resolve(
        context({
          id: 'plain-user-id',
          principalType: 'user',
          capabilities: { roles: ['admin'] },
        }),
      ),
    ).resolves.toBeNull();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('rejects principals without an explicit discriminator', async () => {
    const execute = vi.fn();
    const resolver = new CaslUserContextResolver(
      { execute } as unknown as QueryBus,
      ['sessionUser'],
    );

    await expect(
      resolver.resolve(
        context({
          id: 'service-without-type',
          capabilities: { roles: ['admin'] },
        }),
      ),
    ).resolves.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});
