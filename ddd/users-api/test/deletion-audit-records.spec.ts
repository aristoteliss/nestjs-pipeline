/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AUDIT_MODULE_DEFAULTS } from '@common/audit/audit.options';
import { AUDIT_ACTIONS } from '@common/constants';
import { sessionUserStore } from '@common/context/session-user.store';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  AUDIT_SEVERITY,
  AuditModule,
  type AuditRecord,
  type AuditSink,
} from '@nestjs-pipeline/audit';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, PipelineModule } from '@nestjs-pipeline/core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteRoleCommand } from '../src/roles/cqrs/commands/delete-role.command';
import { DeleteRoleHandler } from '../src/roles/cqrs/commands/delete-role.handler';
import { Role } from '../src/roles/domain/models/role.entity';
import { COMMAND_REPOSITORY as ROLE_COMMAND_REPOSITORY } from '../src/roles/persistence/repository.tokens';
import { DeleteUserCommand } from '../src/users/cqrs/commands/delete-user.command';
import { DeleteUserHandler } from '../src/users/cqrs/commands/delete-user.handler';
import { User } from '../src/users/domain/models/user.entity';
import { COMMAND_REPOSITORY as USER_COMMAND_REPOSITORY } from '../src/users/persistence/repository.tokens';

describe('Deletion audit records fidelity', () => {
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

  beforeEach(async () => {
    recorded.length = 0;

    const moduleRef = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        AuditModule.forRoot({
          sink,
          defaults: AUDIT_MODULE_DEFAULTS,
        }),
        PipelineModule.forRoot(),
      ],
      providers: [
        { provide: LoggingBehavior, useValue: passThroughBehavior },
        { provide: CaslBehavior, useValue: passThroughBehavior },
        { provide: ResilienceBehavior, useValue: passThroughBehavior },
        {
          provide: USER_COMMAND_REPOSITORY.deleteUser,
          useValue: {
            findById: vi.fn().mockImplementation(async (id: string) => {
              if (id.endsWith('99') || id === 'missing-user') return null;
              const user = User.create(
                'Alice',
                'alice@test.com',
                'Engineering',
              );
              Object.defineProperty(user, 'id', { value: id });
              return user;
            }),
            save: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ROLE_COMMAND_REPOSITORY.deleteRole,
          useValue: {
            findById: vi.fn().mockImplementation(async (id: string) => {
              if (id === 'missing-role') return null;
              const role = Role.create('editor');
              Object.defineProperty(role, 'id', { value: id });
              return role;
            }),
            save: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: CaslAuthorizer,
          useValue: { authorize: vi.fn() },
        },
        DeleteUserHandler,
        DeleteRoleHandler,
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    commandBus = app.get(CommandBus);
  });

  it('emits high-severity audit record carrying target and acting user on user deletion', async () => {
    const targetUserId = '019488e0-0000-7000-8000-000000000001';

    await sessionUserStore.run(
      {
        id: 'admin-1',
        email: 'admin@test.com',
        tenant: 'tenant-a',
        department: 'Eng',
        principalType: 'user',
      },
      async () => {
        await commandBus.execute(new DeleteUserCommand({ id: targetUserId }));
      },
    );

    expect(recorded).toHaveLength(1);
    const [record] = recorded;
    expect(record.action).toBe(AUDIT_ACTIONS.USER_DELETE);
    expect(record.severity).toBe(AUDIT_SEVERITY.HIGH);
    expect(record.outcome).toBe('success');
    expect(record.actor).toEqual({
      id: 'admin-1',
      authenticated: true,
      principalType: 'user',
      email: 'admin@test.com',
    });
    expect(record.metadata).toEqual(
      expect.objectContaining({
        targetUserId,
      }),
    );
  });

  it('emits high-severity audit record carrying target and acting user on role deletion', async () => {
    const targetRoleId = '019488e0-0000-7000-8000-000000000002';

    await sessionUserStore.run(
      {
        id: 'admin-2',
        email: 'admin2@test.com',
        tenant: 'tenant-a',
        department: 'Ops',
        principalType: 'user',
      },
      async () => {
        await commandBus.execute(new DeleteRoleCommand({ id: targetRoleId }));
      },
    );

    expect(recorded).toHaveLength(1);
    const [record] = recorded;
    expect(record.action).toBe(AUDIT_ACTIONS.ROLE_DELETE);
    expect(record.severity).toBe(AUDIT_SEVERITY.HIGH);
    expect(record.outcome).toBe('success');
    expect(record.actor).toEqual({
      id: 'admin-2',
      authenticated: true,
      principalType: 'user',
      email: 'admin2@test.com',
    });
    expect(record.metadata).toEqual(
      expect.objectContaining({
        targetRoleId,
      }),
    );
  });

  it('records unauthenticated actor when session context is absent', async () => {
    const targetUserId = '019488e0-0000-7000-8000-000000000003';

    await commandBus.execute(new DeleteUserCommand({ id: targetUserId }));

    expect(recorded).toHaveLength(1);
    const [record] = recorded;
    expect(record.actor).toEqual({ authenticated: false });
    expect(record.metadata).toEqual(
      expect.objectContaining({
        targetUserId,
      }),
    );
  });

  it('records audit record on failure with target metadata and actor preserved', async () => {
    const missingUserId = '019488e0-0000-7000-8000-000000000099';

    await expect(
      sessionUserStore.run(
        {
          id: 'admin-fail',
          email: 'fail@test.com',
          tenant: 'tenant-a',
          principalType: 'user',
        },
        async () => {
          await commandBus.execute(
            new DeleteUserCommand({ id: missingUserId }),
          );
        },
      ),
    ).rejects.toThrow();

    expect(recorded).toHaveLength(1);
    const [record] = recorded;
    expect(record.outcome).toBe('failure');
    expect(record.action).toBe(AUDIT_ACTIONS.USER_DELETE);
    expect(record.severity).toBe(AUDIT_SEVERITY.HIGH);
    expect(record.actor).toEqual({
      id: 'admin-fail',
      authenticated: true,
      principalType: 'user',
      email: 'fail@test.com',
    });
    expect(record.metadata).toEqual(
      expect.objectContaining({
        targetUserId: missingUserId,
      }),
    );
  });
});
