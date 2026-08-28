import { createMongoAbility } from '@casl/ability';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { CaslBehavior } from './casl.behavior';
import type {
  IRoleProvider,
  IUserContextResolver,
} from './interfaces/providers.interface';

function makeContext(prebuiltAbility: ReturnType<typeof createMongoAbility>): IPipelineContext {
  return {
    correlationId: 'corr-1',
    originalCorrelationId: 'corr-1',
    request: { postId: 'p1' },
    requestType: class GetPostQuery {},
    requestName: 'GetPostQuery',
    handlerType: class GetPostHandler {},
    handlerName: 'GetPostHandler',
    requestKind: 'query',
    startedAt: new Date(),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue({
      prebuiltAbility,
      rules: [{ action: 'read', subject: 'Post' }],
    }),
  } as unknown as IPipelineContext;
}

describe('CaslBehavior prebuiltAbility', () => {
  it('does not require or resolve user context when an ability is already supplied', async () => {
    const roleProvider: IRoleProvider = {
      getRoles: vi.fn().mockResolvedValue([]),
    };
    const userContextResolver: IUserContextResolver = {
      resolve: vi.fn().mockRejectedValue(new Error('resolver should not run')),
    };
    const ability = createMongoAbility<[string, string]>([
      { action: 'read', subject: 'Post' },
    ]);
    const behavior = new CaslBehavior(
      roleProvider,
      userContextResolver,
      undefined,
      undefined,
      [],
      undefined,
    );

    await expect(
      behavior.handle(makeContext(ability), () => Promise.resolve('ok')),
    ).resolves.toBe('ok');
    expect(userContextResolver.resolve).not.toHaveBeenCalled();
    expect(roleProvider.getRoles).not.toHaveBeenCalled();
  });
});
