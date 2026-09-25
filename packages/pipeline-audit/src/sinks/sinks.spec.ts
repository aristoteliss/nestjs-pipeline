/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import type { AuditRecord } from '../interfaces/audit-record.interface';
import { LogAuditSink } from './log.sink';
import {
  createAuditTableSql,
  PostgresAuditSink,
  type PostgresQueryableLike,
} from './postgres.sink';

function makeRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: 'rec-1',
    correlationId: 'corr-123',
    action: 'user.create',
    severity: 'medium',
    outcome: 'success',
    actor: { id: 'admin-1' },
    requestKind: 'command',
    requestName: 'CreateUserCommand',
    handlerName: 'CreateUserHandler',
    payload: { username: 'jane' },
    durationMs: 12.5,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('LogAuditSink', () => {
  it('logs successes via log() and failures via warn()', () => {
    const logger = { log: vi.fn(), warn: vi.fn() };
    const sink = new LogAuditSink({ logger });

    sink.write(makeRecord());
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();

    sink.write(makeRecord({ outcome: 'failure' }));
    expect(logger.warn).toHaveBeenCalledTimes(1);

    const line = logger.log.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toMatchObject({ action: 'user.create' });
  });

  it('preserves special values as tagged JSON', () => {
    const logger = { log: vi.fn(), warn: vi.fn() };
    const sink = new LogAuditSink({ logger });

    sink.write(
      makeRecord({
        payload: {
          map: new Map([['id', 1]]),
          set: new Set(['admin']),
          pattern: /secret/gi,
          error: new TypeError('bad input'),
          callback: function auditCallback() {},
          marker: Symbol('audit-marker'),
        },
      }),
    );

    const parsed = JSON.parse(logger.log.mock.calls[0][0] as string);
    expect(parsed.payload.map).toEqual({
      $type: 'Map',
      entries: [['id', 1]],
    });
    expect(parsed.payload.set).toEqual({
      $type: 'Set',
      values: ['admin'],
    });
    expect(parsed.payload.pattern).toMatchObject({
      $type: 'RegExp',
      source: 'secret',
      flags: 'gi',
    });
    expect(parsed.payload.error).toMatchObject({
      $type: 'Error',
      name: 'TypeError',
      message: 'bad input',
    });
    expect(parsed.payload.callback).toEqual({
      $type: 'Function',
      name: 'auditCallback',
    });
    expect(parsed.payload.marker).toEqual({
      $type: 'Symbol',
      description: 'audit-marker',
    });
  });

  it('pretty-prints the JSON record over multiple lines when pretty=true', () => {
    const logger = { log: vi.fn(), warn: vi.fn() };
    const record = makeRecord();

    new LogAuditSink({ logger, pretty: true }).write(record);

    const line = logger.log.mock.calls[0][0] as string;
    expect(line).toBe(JSON.stringify(record, null, 2));
  });

  it('preserves symbol-keyed own properties as tagged JSON entries', () => {
    const logger = { log: vi.fn(), warn: vi.fn() };
    const sink = new LogAuditSink({ logger });
    const scope = Symbol('scope');

    sink.write(makeRecord({ payload: { id: 1, [scope]: 'private' } }));

    const parsed = JSON.parse(logger.log.mock.calls[0][0] as string);
    expect(parsed.payload).toEqual({
      $type: 'Object',
      properties: { id: 1 },
      symbolProperties: [
        [{ $type: 'Symbol', description: 'scope' }, 'private'],
      ],
    });
  });
});

describe('PostgresAuditSink', () => {
  it('inserts a row with bound parameters', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const db: PostgresQueryableLike = { query };
    const sink = new PostgresAuditSink(db, { table: 'audit.audit_log' });

    await sink.write(makeRecord());

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit.audit_log');
    expect(values[0]).toBe('rec-1');
    expect(values[2]).toBe('user.create');
    expect(values[5]).toBe(JSON.stringify({ id: 'admin-1' }));
    expect(values[9]).toBe(JSON.stringify({ username: 'jane' }));
    expect(values[10]).toBeNull();
  });

  it('uses the tagged representation for JSONB values', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const sink = new PostgresAuditSink({ query });

    await sink.write(makeRecord({ payload: new Set(['admin']) }));

    const values = query.mock.calls[0][1] as unknown[];
    expect(JSON.parse(values[9] as string)).toEqual({
      $type: 'Set',
      values: ['admin'],
    });
  });

  it('binds a NUL character or a lone surrogate as U+FFFD, which jsonb accepts', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const sink = new PostgresAuditSink({ query });

    await sink.write(
      makeRecord({
        payload: { note: 'a\u0000b', broken: '\ud800' },
        metadata: { source: 'x\u0000' },
      }),
    );

    const values = query.mock.calls[0][1] as unknown[];
    expect(values[9]).not.toMatch(/\\u0000|\\ud800/);
    expect(JSON.parse(values[9] as string)).toEqual({
      note: 'a\ufffdb',
      broken: '\ufffd',
    });
    expect(JSON.parse(values[13] as string)).toEqual({ source: 'x\ufffd' });
  });

  it('rejects unsafe table identifiers', () => {
    const db: PostgresQueryableLike = { query: vi.fn() };
    expect(
      () => new PostgresAuditSink(db, { table: 'audit; DROP TABLE x' }),
    ).toThrow(/Invalid audit table name/);
    expect(() => createAuditTableSql('a b')).toThrow(
      /Invalid audit table name/,
    );
  });

  it('createAuditTableSql emits a CREATE TABLE statement', () => {
    expect(createAuditTableSql()).toContain(
      'CREATE TABLE IF NOT EXISTS audit_log',
    );
  });

  it('serializes tenantId into metadata and handles response, error, and absent actor', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const sink = new PostgresAuditSink({ query });

    const err = new Error('database connection failed');
    await sink.write(
      makeRecord({
        actor: undefined,
        payload: undefined,
        response: { success: true },
        error: err,
        tenantId: 'tenant-42',
        metadata: { env: 'production' },
      }),
    );

    const values = query.mock.calls[0][1] as unknown[];
    expect(values[5]).toBeNull(); // actor
    expect(values[9]).toBeNull(); // payload
    expect(JSON.parse(values[10] as string)).toEqual({ success: true }); // response
    expect(JSON.parse(values[11] as string)).toMatchObject({
      name: 'Error',
      message: 'database connection failed',
    }); // error
    expect(JSON.parse(values[13] as string)).toEqual({
      env: 'production',
      tenantId: 'tenant-42',
    }); // metadata
  });

  it('stores the tenantId as metadata when the record carries no other metadata', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const sink = new PostgresAuditSink({ query });

    await sink.write(makeRecord({ tenantId: 'tenant-42' }));

    const values = query.mock.calls[0][1] as unknown[];
    expect(JSON.parse(values[13] as string)).toEqual({ tenantId: 'tenant-42' });
  });
});
