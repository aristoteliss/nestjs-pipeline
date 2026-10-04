/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AUDIT_MODULE_DEFAULTS } from '@common/audit/audit.options.js';
import { AUDIT_ACTIONS } from '@common/constants/index.js';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { LoggingBehavior } from '@cqrs-ddd/pipeline';
import {
  AUDIT_SEVERITY,
  AuditBehavior,
  type AuditRecord,
  type AuditSink,
} from '@cqrs-ddd/pipeline-audit';
import { MetricsBehavior } from '@cqrs-ddd/pipeline-opentelemetry';
import { RateLimitBehavior } from '@cqrs-ddd/pipeline-rate-limit';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateAuthCommand } from '../src/auths/application/cqrs/commands/create-auth.command.js';
import { CreateAuthHandler } from '../src/auths/application/cqrs/commands/create-auth.handler.js';
import { AUTH_TOKEN_POLICY } from '../src/auths/application/ports/auth-token-policy.port.js';
import { REFRESH_TOKENS } from '../src/auths/application/ports/refresh-tokens.port.js';
import { SESSION_COOKIES } from '../src/auths/application/ports/session-cookies.port.js';
import { NodeRefreshTokens } from '../src/auths/infrastructure/node-refresh-tokens.js';
import { COMMAND_REPOSITORY } from '../src/auths/persistence/repository.tokens.js';
import { PrincipalLoginService } from '../src/auths/services/principal-login.service.js';

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
      imports: [CqrsModule.forRoot(), PipelineModule.forRoot()],
      providers: [
        {
          provide: AuditBehavior,
          useValue: new AuditBehavior(sink, AUDIT_MODULE_DEFAULTS),
        },
        { provide: LoggingBehavior, useValue: passThroughBehavior },
        { provide: MetricsBehavior, useValue: passThroughBehavior },
        { provide: RateLimitBehavior, useValue: passThroughBehavior },
        {
          provide: PrincipalLoginService,
          useValue: {
            authenticate,
            sign: vi.fn(),
          },
        },
        {
          provide: COMMAND_REPOSITORY.createAuth,
          useValue: { save: vi.fn().mockResolvedValue(null) },
        },
        { provide: REFRESH_TOKENS, useClass: NodeRefreshTokens },
        {
          provide: AUTH_TOKEN_POLICY,
          useValue: {
            refreshTokenTtlSeconds: 3600,
            refreshReuseGraceSeconds: 30,
            embedPermissions: false,
          },
        },
        {
          provide: SESSION_COOKIES,
          useValue: { save: vi.fn(), clear: vi.fn() },
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
