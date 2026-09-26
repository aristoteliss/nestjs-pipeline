/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { DeadLetterBehavior } from './dead-letter.behavior';
import { DeadLetterRedriver } from './dead-letter.redriver';
import { DeadLetterRedriveError } from './errors/dead-letter-redrive.error';
import { currentRedriveId } from './helpers/redrive-scope';
import type {
  DeadLetterRecord,
  DeadLetterStore,
} from './interfaces/dead-letter-transport.interface';

class UserCreatedEvent {
  constructor(readonly userId: string) {}
  label(): string {
    return `user ${this.userId}`;
  }
}

function makeRecord(
  overrides: Partial<DeadLetterRecord> = {},
): DeadLetterRecord {
  return {
    id: 'dl-1',
    correlationId: 'corr-1',
    requestKind: 'event',
    requestName: 'UserCreatedEvent',
    handlerName: 'SendWelcomeEmailHandler',
    payload: { userId: 'u-1' },
    error: { name: 'Error', message: 'smtp down' },
    failedAt: '2026-01-01T00:00:00.000Z',
    attempts: 0,
    status: 'open',
    payloadRedacted: false,
    ...overrides,
  };
}

function memoryStore(record?: DeadLetterRecord) {
  const records = new Map<string, DeadLetterRecord>();
  if (record) records.set(record.id, record);
  const store: DeadLetterStore = {
    send: vi.fn(async (sent: DeadLetterRecord) => {
      records.set(sent.id, sent);
    }),
    get: vi.fn(async (id: string) => records.get(id)),
    list: vi.fn(async () => [...records.values()]),
    recordAttempt: vi.fn(async (id, error) => {
      const current = records.get(id) as DeadLetterRecord;
      records.set(id, {
        ...current,
        attempts: current.attempts + 1,
        lastError: error,
      });
    }),
    markResolved: vi.fn(async (id: string) => {
      const current = records.get(id) as DeadLetterRecord;
      records.set(id, { ...current, status: 'resolved' });
    }),
  };
  return { store, records };
}

describe('DeadLetterRedriver', () => {
  it('rebuilds the request as an instance of its class, dispatches it and resolves the record', async () => {
    const { store, records } = memoryStore(makeRecord());
    const event = vi.fn((request: unknown, _record: DeadLetterRecord) => {
      expect(currentRedriveId()).toBe('dl-1');
      return (request as UserCreatedEvent).label();
    });
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: { event },
    });

    await expect(redriver.redrive('dl-1')).resolves.toEqual({
      id: 'dl-1',
      response: 'user u-1',
    });

    const [request, record] = event.mock.calls[0] ?? [];
    expect(request).toBeInstanceOf(UserCreatedEvent);
    expect((record as DeadLetterRecord).handlerName).toBe(
      'SendWelcomeEmailHandler',
    );
    expect(records.get('dl-1')?.status).toBe('resolved');
    expect(currentRedriveId()).toBeUndefined();
  });

  it('counts a failed attempt, keeps its error and rethrows it', async () => {
    const { store, records } = memoryStore(makeRecord());
    const failure = new TypeError('still down');
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: { event: () => Promise.reject(failure) },
    });

    await expect(redriver.redrive('dl-1')).rejects.toBe(failure);
    await expect(
      new DeadLetterRedriver(store, {
        requestTypes: [UserCreatedEvent],
        dispatch: { event: () => Promise.reject('offline') },
      }).redrive('dl-1'),
    ).rejects.toBe('offline');

    expect(records.get('dl-1')).toMatchObject({
      attempts: 2,
      status: 'open',
      lastError: { name: 'unknown', message: 'offline' },
    });
    expect(store.recordAttempt).toHaveBeenNthCalledWith(1, 'dl-1', {
      name: 'TypeError',
      message: 'still down',
    });
  });

  it('refuses, without dispatching, a record it cannot redrive', async () => {
    const dispatch = vi.fn();
    const cases: Array<[DeadLetterRecord | undefined, string]> = [
      [undefined, 'no such dead letter'],
      [makeRecord({ status: 'resolved' }), 'it is already resolved'],
      [
        makeRecord({ requestName: 'OtherEvent' }),
        'request type OtherEvent is not registered in requestTypes',
      ],
      [
        makeRecord({ requestKind: 'command' }),
        'no dispatch is configured for command requests',
      ],
      [
        makeRecord({ payloadRedacted: true }),
        'its payload was redacted; configure rebuild to restore the redacted values',
      ],
    ];

    for (const [record, reason] of cases) {
      const { store } = memoryStore(record);
      const redriver = new DeadLetterRedriver(store, {
        requestTypes: [UserCreatedEvent],
        dispatch: { event: dispatch },
      });
      const error = await redriver.redrive('dl-1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DeadLetterRedriveError);
      expect(error).toMatchObject({
        deadLetterId: 'dl-1',
        reason,
        message: `Cannot redrive dead letter dl-1: ${reason}`,
      });
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('redrives a redacted record through rebuild, which restores the values', async () => {
    const { store } = memoryStore(
      makeRecord({ payloadRedacted: true, payload: { userId: '[REDACTED]' } }),
    );
    const rebuild = vi.fn(() => new UserCreatedEvent('u-restored'));
    const event = vi.fn(
      (request: unknown) => (request as UserCreatedEvent).userId,
    );
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: { event },
      rebuild,
    });

    await expect(redriver.redrive('dl-1')).resolves.toMatchObject({
      response: 'u-restored',
    });
    expect(rebuild).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dl-1' }),
      UserCreatedEvent,
    );
  });

  it('resolves a record without replaying it', async () => {
    const { store, records } = memoryStore(makeRecord());
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [],
      dispatch: {},
    });

    await redriver.resolve('dl-1');

    expect(records.get('dl-1')?.status).toBe('resolved');
  });

  it('is neither captured again nor swallowed by DeadLetterBehavior during a redrive', async () => {
    const { store, records } = memoryStore(makeRecord());
    const behavior = new DeadLetterBehavior(store);
    const context = {
      correlationId: 'corr-2',
      request: { userId: 'u-1' },
      requestName: 'UserCreatedEvent',
      handlerName: 'SendWelcomeEmailHandler',
      requestKind: 'event',
      items: new Map(),
      getBehaviorOptions: vi.fn().mockReturnValue({ rethrow: false }),
    } as unknown as IPipelineContext;
    const failure = new Error('smtp still down');
    const redriver = new DeadLetterRedriver(store, {
      requestTypes: [UserCreatedEvent],
      dispatch: {
        event: () => behavior.handle(context, () => Promise.reject(failure)),
      },
    });

    await expect(redriver.redrive('dl-1')).rejects.toBe(failure);

    expect(store.send).not.toHaveBeenCalled();
    expect(records.size).toBe(1);
    expect(records.get('dl-1')?.attempts).toBe(1);
  });
});
