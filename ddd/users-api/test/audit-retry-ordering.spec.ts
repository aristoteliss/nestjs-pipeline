/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Behavior ordering: a behavior that *records a fact about the operation* must
 * sit outside a behavior that can *re-execute* it.
 *
 * `AuditBehavior` writes one record per invocation, on both the success and the
 * failure path. Placed inside `ResilienceBehavior`, a delete that fails twice
 * before succeeding produced three records — two failures and a success — for
 * one logical operation, with a `durationMs` measuring a single attempt rather
 * than the real cost. An audit log that cannot answer "how many users were
 * deleted" without deduplication is not an audit log.
 *
 * These handlers are also listed in SKILL.md as positive examples to copy, so
 * the ordering propagates.
 */

import { CommandBus, CommandHandler, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { AuditBehavior, AuditModule } from '@nestjs-pipeline/audit';
import {
  PIPELINE_BEHAVIORS_METADATA,
  PipelineModule,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  isTransientOperationError,
  TransientOperationError,
} from '@nestjs-pipeline/ddd-core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import { beforeEach, describe, expect, it } from 'vitest';
import { DeleteRoleHandler } from '../src/roles/cqrs/commands/delete-role.handler';
import { DeleteUserHandler } from '../src/users/cqrs/commands/delete-user.handler';

const records: Array<{ action: string; outcome: string }> = [];

const recordingSink = {
  async write(record: { action: string; outcome: string }) {
    records.push({ action: record.action, outcome: record.outcome });
  },
};

class FlakyDeleteCommand {}

let attempts = 0;

/** Mirrors the reference handlers' declaration order. */
@CommandHandler(FlakyDeleteCommand)
@UsePipeline(
  [AuditBehavior, { action: 'thing.delete' }],
  [
    ResilienceBehavior,
    {
      handle: isTransientOperationError,
      retry: {
        maxAttempts: 3,
        replaySafe: true,
        backoff: { type: 'constant', delay: 0 },
      },
    },
  ],
)
class FlakyDeleteHandler {
  async execute(_command: FlakyDeleteCommand) {
    attempts += 1;
    if (attempts < 3) {
      throw new TransientOperationError('database unavailable');
    }
    return 'deleted';
  }
}

describe('audit records per logical operation, not per retry', () => {
  beforeEach(() => {
    records.length = 0;
    attempts = 0;
  });

  it('writes exactly one record when the operation succeeds after retries', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        AuditModule.forRoot({ sink: recordingSink as never }),
        PipelineModule.forRoot({
          behaviors: [AuditBehavior, ResilienceBehavior],
        }),
      ],
      providers: [FlakyDeleteHandler],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      await expect(
        app.get(CommandBus).execute(new FlakyDeleteCommand()),
      ).resolves.toBe('deleted');

      expect(attempts).toBe(3);
      // One record for one logical operation, reporting the real outcome.
      // Inside the retry this was three: two failures and a success.
      expect(records).toEqual([{ action: 'thing.delete', outcome: 'success' }]);
    } finally {
      await app.close();
    }
  });
});

describe('reference handlers declare audit outside resilience', () => {
  /** Reads the behavior order the pipeline will apply. */
  function declaredBehaviors(handler: object): string[] {
    const behaviors: Array<{ name: string }> =
      Reflect.getMetadata(PIPELINE_BEHAVIORS_METADATA, handler) ?? [];
    return behaviors.map((behavior) => behavior.name);
  }

  it.each([
    ['DeleteUserHandler', DeleteUserHandler],
    ['DeleteRoleHandler', DeleteRoleHandler],
  ])('%s audits outside its retry policy', (_name, handler) => {
    const order = declaredBehaviors(handler);

    expect(order).toContain('AuditBehavior');
    expect(order).toContain('ResilienceBehavior');
    expect(order.indexOf('AuditBehavior')).toBeLessThan(
      order.indexOf('ResilienceBehavior'),
    );
  });
});
