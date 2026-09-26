/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as coreDomain from '@cqrs-ddd/core/domain';
import {
  ConcurrencyConflictError,
  DomainException,
  EntityNotFoundException,
  InvalidValueException,
  MissingTenantContextError,
  TransientOperationError,
  UnknownMutableFieldError,
} from '@cqrs-ddd/core/domain';
import type { INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { UnauthorizedActionException } from '@nestjs-pipeline/casl';
import { PipelineModule } from '@nestjs-pipeline/core';
import {
  DeadLetterBehavior,
  DeadLetterModule,
  type DeadLetterRecord,
} from '@nestjs-pipeline/deadletter';
import { FeatureDisabledError } from '@nestjs-pipeline/feature-flags';
import {
  IdempotencyCompletionError,
  IdempotencyConflictError,
} from '@nestjs-pipeline/idempotency';
import { RateLimitExceededError } from '@nestjs-pipeline/rate-limit';
import { ZodValidationError } from '@nestjs-pipeline/zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  AuthConfigurationException,
  InvalidLoginCredentialsException,
} from '../auths/domain/errors/authentication.exception';
import {
  MissingPrincipalContextError,
  MissingReplayScopeContextError,
} from '../common/cqrs/helpers/idempotent-operation.helper';
import {
  InvalidTenantSchemaError,
  UnknownTenantSchemaError,
} from '../persistence/tenant-schema.errors';
import {
  InvalidRoleNameException,
  UniqueRoleNameException,
} from '../roles/domain/models/errors/role-name.exception';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
  UniqueEmailException,
} from '../users/domain/models/errors';
import type { User } from '../users/domain/models/user.entity';
import { MixedTenantBatchError } from '../users/jobs/batch-update-users.processor';
import {
  DEAD_LETTER_DEFAULTS,
  EXPECTED_REJECTIONS,
} from './dead-letter.options';

type ErrorClass = abstract new (...args: never[]) => Error;

/**
 * The application and core domain errors that are dead-lettered: base classes,
 * misconfigurations, broken invariants and failures a replay may fix. Every
 * other such error class must be in `EXPECTED_REJECTIONS`.
 * `InvalidValueException` is a base class: the application's subclasses for
 * caller input are rejections, and any other value violation is a broken
 * invariant.
 */
const CAPTURED_ERRORS: readonly ErrorClass[] = [
  DomainException,
  InvalidValueException,
  TransientOperationError,
  UnknownMutableFieldError,
  MissingTenantContextError,
  AuthConfigurationException,
  MissingPrincipalContextError,
  MissingReplayScopeContextError,
  InvalidTenantSchemaError,
  UnknownTenantSchemaError,
  MixedTenantBatchError,
];

const isErrorClass = (value: unknown): value is ErrorClass =>
  typeof value === 'function' && value.prototype instanceof Error;

/**
 * Every error class exported by an `api/src` source file whose declaration
 * extends an `…Error` or `…Exception` class, plus the `@cqrs-ddd/core/domain`
 * errors.
 */
async function errorClasses(): Promise<ErrorClass[]> {
  const root = resolve(__dirname, '..');
  const declaring = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .map((file) => resolve(root, file))
    .filter((file) =>
      /^export (?:abstract )?class \w+ extends [\w.]*(?:Error|Exception)\b/m.test(
        readFileSync(file, 'utf8'),
      ),
    );
  const modules = await Promise.all(
    declaring.map((file) => import(file) as Promise<Record<string, unknown>>),
  );
  return [
    ...new Set(
      [...modules, coreDomain].flatMap((exports) =>
        Object.values(exports).filter(isErrorClass),
      ),
    ),
  ];
}

class FailingCommand {
  constructor(readonly error: Error) {}
}

@CommandHandler(FailingCommand)
class FailingHandler implements ICommandHandler<FailingCommand> {
  async execute(command: FailingCommand): Promise<never> {
    throw command.error;
  }
}

const expectedRejections: Array<[string, Error]> = [
  ['request validation', new ZodValidationError(new ZodError([]))],
  ['missing session', new UnauthorizedException()],
  [
    'CASL denial',
    new UnauthorizedActionException({ action: 'update', subject: 'User' }),
  ],
  ['wrong login credentials', new InvalidLoginCredentialsException()],
  ['missing entity', new EntityNotFoundException('User', 'u-1')],
  ['stale version', new ConcurrencyConflictError('User', 'u-1', 1, 2)],
  [
    'duplicate email',
    new UniqueEmailException({ email: 'taken@example.com' } as User),
  ],
  ['duplicate role name', new UniqueRoleNameException('admin')],
  ['empty user update', new EmptyUserUpdateException()],
  [
    'short username',
    new InvalidUsernameException({
      field: 'username',
      rule: 'minLength',
      limit: 3,
    }),
  ],
  [
    'short department',
    new InvalidDepartmentException({
      field: 'department',
      rule: 'minLength',
      limit: 3,
    }),
  ],
  [
    'short role name',
    new InvalidRoleNameException({
      field: 'name',
      rule: 'minLength',
      limit: 3,
    }),
  ],
  [
    'disabled feature',
    new FeatureDisabledError('user-registration', 'FailingCommand'),
  ],
  [
    'rate limit',
    new RateLimitExceededError({
      key: 'k',
      requestName: 'FailingCommand',
      msBeforeNext: 1000,
      remainingPoints: 0,
    }),
  ],
  [
    'idempotency key reuse',
    new IdempotencyConflictError({
      key: 'k',
      requestName: 'FailingCommand',
      reason: 'key_reuse',
    }),
  ],
];

describe('application error classification', () => {
  it('finds the error classes of the application and of the core domain', async () => {
    expect(await errorClasses()).toEqual(
      expect.arrayContaining([
        UniqueEmailException,
        MixedTenantBatchError,
        InvalidTenantSchemaError,
        MissingTenantContextError,
      ]),
    );
  });

  it('puts every error class either among the expected rejections or among the captured errors', async () => {
    const unclassified: string[] = [];
    const both: string[] = [];
    for (const errorClass of await errorClasses()) {
      const expected = EXPECTED_REJECTIONS.some(
        (target) =>
          errorClass === target || errorClass.prototype instanceof target,
      );
      const captured = CAPTURED_ERRORS.includes(errorClass);
      if (!expected && !captured) unclassified.push(errorClass.name);
      if (expected && captured) both.push(errorClass.name);
    }

    expect({ unclassified, both }).toEqual({ unclassified: [], both: [] });
  });
});

describe('application dead-letter classification', () => {
  const records: DeadLetterRecord[] = [];
  let app: INestApplication;
  let bus: CommandBus;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        DeadLetterModule.forRoot({
          transport: {
            send: async (record) => {
              records.push(record);
            },
          },
          defaults: DEAD_LETTER_DEFAULTS,
        }),
        PipelineModule.forRoot({
          behaviors: [DeadLetterBehavior],
          globalBehaviors: [
            {
              scope: 'commands',
              before: [[DeadLetterBehavior, { captureKinds: ['command'] }]],
            },
          ],
        }),
      ],
      providers: [FailingHandler],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    bus = app.get(CommandBus);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    records.length = 0;
  });

  it.each(expectedRejections)(
    'propagates a %s rejection without dead-lettering it',
    async (_label, error) => {
      await expect(bus.execute(new FailingCommand(error))).rejects.toBe(error);
      expect(records).toHaveLength(0);
    },
  );

  it('keeps a completion failure after a successful handler out of the replay queue', async () => {
    const error = new IdempotencyCompletionError(
      'k',
      'claim-1',
      new Error('store unavailable'),
    );

    await expect(bus.execute(new FailingCommand(error))).rejects.toBe(error);
    expect(records).toHaveLength(0);
  });

  it.each([
    ['an unexpected processor failure', new Error('connection reset')],
    [
      'an authentication misconfiguration',
      new AuthConfigurationException('JWT secret is not configured'),
    ],
    ['a missing tenant context', new MissingTenantContextError('users.create')],
  ])('dead-letters %s exactly once', async (_label, error) => {
    await expect(bus.execute(new FailingCommand(error))).rejects.toBe(error);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      requestName: 'FailingCommand',
      requestKind: 'command',
      error: { message: error.message },
    });
  });
});
