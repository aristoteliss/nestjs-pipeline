/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AUDIT_MODULE_DEFAULTS } from '@common/audit/audit.options';
import { AUDIT_ACTIONS } from '@common/constants';
import { TENANT_CONTEXT } from '@common/context/tenant-context.port';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  AUDIT_SEVERITY,
  AuditModule,
  type AuditRecord,
  type AuditSink,
} from '@nestjs-pipeline/audit';
import { LoggingBehavior, PipelineModule } from '@nestjs-pipeline/core';
import { MetricsBehavior } from '@nestjs-pipeline/opentelemetry';
import { RateLimitBehavior } from '@nestjs-pipeline/rate-limit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_TOKEN_POLICY,
  REFRESH_TOKENS,
} from '../src/auths/application/authentication.ports';
import { CreateAuthCommand } from '../src/auths/cqrs/commands/create-auth.command';
import { CreateAuthHandler } from '../src/auths/cqrs/commands/create-auth.handler';
import { NodeRefreshTokens } from '../src/auths/infrastructure/node-refresh-tokens';
import { COMMAND_REPOSITORY } from '../src/auths/persistence/repository.tokens';
import { UserLoginService } from '../src/auths/services/user-login.service';

describe('Login audit actor', () => {
  const recorded: AuditRecord[] = [];

  const sink: AuditSink = {
    async write(record: AuditRecord): Promise<void> {
      recorded.push(record);
    },
  };

  const passThroughBehavior = {
    handle: (_ctx: unknown, next: () => Promise<unknown>) => next(),
  };

  let commandBus: CommandBus;
  let authenticate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    recorded.length = 0;
    authenticate = vi.fn().mockRejectedValue(new Error('Invalid credentials.'));

    const moduleRef = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        AuditModule.forRoot({ sink, defaults: AUDIT_MODULE_DEFAULTS }),
        PipelineModule.forRoot(),
      ],
      providers: [
        { provide: LoggingBehavior, useValue: passThroughBehavior },
        { provide: MetricsBehavior, useValue: passThroughBehavior },
        { provide: RateLimitBehavior, useValue: passThroughBehavior },
        {
          provide: UserLoginService,
          useValue: {
            authenticate,
            signToken: vi.fn(),
          },
        },
        {
          provide: COMMAND_REPOSITORY.createAuth,
          useValue: { save: vi.fn().mockResolvedValue(null) },
        },
        { provide: TENANT_CONTEXT, useValue: { schema: 'tenant-a' } },
        { provide: REFRESH_TOKENS, useClass: NodeRefreshTokens },
        {
          provide: AUTH_TOKEN_POLICY,
          useValue: {
            refreshTokenTtlSeconds: 3600,
            refreshReuseGraceSeconds: 30,
            permissionsInAccessToken: false,
          },
        },
        CreateAuthHandler,
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    commandBus = app.get(CommandBus);
  });

  async function login(email: string): Promise<void> {
    await expect(
      commandBus.execute(
        new CreateAuthCommand({
          email,
          code: '424242',
          clientIp: '203.0.113.7',
        }),
      ),
    ).rejects.toThrow();
  }

  it('records the caller-supplied address as a claim, never as an actor identity', async () => {
    await login('attacker@evil.test');

    expect(recorded).toHaveLength(1);
    const [record] = recorded;
    expect(record.action).toBe(AUDIT_ACTIONS.AUTH_LOGIN);
    expect(record.severity).toBe(AUDIT_SEVERITY.MEDIUM);
    expect(record.outcome).toBe('failure');
    expect(record.actor).toEqual({
      authenticated: false,
      claimedEmail: 'attacker@evil.test',
    });
    expect(record.actor).not.toHaveProperty('id');
  });

  it('keeps a login record out of a consumer filter for authenticated activity', async () => {
    await login('admin@corp.test');

    const trusted = recorded.filter(
      (record) => record.actor?.authenticated !== false,
    );
    expect(trusted).toEqual([]);
  });

  it('preserves the attempted address in the payload while redacting the code', async () => {
    await login('someone@corp.test');

    const [record] = recorded;
    expect(record.payload).toMatchObject({ email: 'someone@corp.test' });
    expect(record.payload).not.toMatchObject({ code: '424242' });
  });
});
