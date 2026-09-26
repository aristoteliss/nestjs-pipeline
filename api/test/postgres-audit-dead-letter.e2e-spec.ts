/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { uuidv7 } from '@cqrs-ddd/uuidv7';
import {
  type AuditRecord,
  createAuditTableSql,
  PostgresAuditSink,
} from '@nestjs-pipeline/audit';
import {
  createDeadLetterTableSql,
  type DeadLetterRecord,
  PostgresDeadLetterTransport,
} from '@nestjs-pipeline/deadletter';
import { Pool } from 'pg';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let postgres: StartedTestContainer | undefined;
let pool: Pool;

beforeAll(async () => {
  postgres = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_DB: 'sinks_test',
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
    )
    .start();
  pool = new Pool({
    host: postgres.getHost(),
    port: postgres.getMappedPort(5432),
    database: 'sinks_test',
    user: 'test',
    password: 'test',
  });
  await pool.query(createAuditTableSql());
  await pool.query(createDeadLetterTableSql());
});

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

/** A payload with the shapes JSONB must keep exactly. */
const richPayload = {
  lines: [
    { sku: 'A-1', quantity: 2, tags: ['gift', 'fragile'] },
    { sku: 'B-2', quantity: 1, tags: [] },
  ],
  customer: { name: 'Ελένη Παπαδοπούλου', city: 'Zürich', note: '注文 ✓ 🚚' },
  flags: { express: true, coupon: null },
  total: 42.5,
};

describe('PostgresAuditSink against PostgreSQL', () => {
  const record = (id: string, overrides: Partial<AuditRecord> = {}) =>
    ({
      id,
      correlationId: `corr-${id}`,
      tenantId: 'tenant-a',
      action: 'order.create',
      severity: 'medium',
      outcome: 'success',
      actor: { id: 'user-1', roles: ['clerk'] },
      requestKind: 'command',
      requestName: 'CreateOrderCommand',
      handlerName: 'CreateOrderHandler',
      payload: richPayload,
      response: { orderId: 'o-1' },
      durationMs: 12.75,
      timestamp: '2026-09-25T08:00:00.000Z',
      metadata: { source: 'api' },
      ...overrides,
    }) as AuditRecord;

  const row = async (id: string) =>
    (await pool.query('SELECT * FROM audit_log WHERE id = $1', [id])).rows[0];

  it('stores arrays, nested objects and non-ASCII text unchanged', async () => {
    const sink = new PostgresAuditSink(pool);
    const id = '0199a1b2-0000-7000-8000-000000000001';

    await sink.write(record(id));

    const stored = await row(id);
    expect(stored.payload).toEqual(richPayload);
    expect(stored.actor).toEqual({ id: 'user-1', roles: ['clerk'] });
    expect(stored.response).toEqual({ orderId: 'o-1' });
    expect(stored.error).toBeNull();
    expect(stored.metadata).toEqual({ source: 'api', tenantId: 'tenant-a' });
    expect(stored.duration_ms).toBe(12.75);
    expect((stored.occurred_at as Date).toISOString()).toBe(
      '2026-09-25T08:00:00.000Z',
    );
  });

  it('stores values JSON cannot express as tagged objects', async () => {
    const sink = new PostgresAuditSink(pool);
    const id = '0199a1b2-0000-7000-8000-000000000002';

    await sink.write(
      record(id, {
        payload: { amount: 10n, ratio: Number.POSITIVE_INFINITY },
        outcome: 'failure',
        response: undefined,
        error: { name: 'PaymentDeclined', message: 'Karte abgelehnt' },
      }),
    );

    const stored = await row(id);
    expect(stored.payload).toEqual({
      amount: { $type: 'BigInt', value: '10' },
      ratio: { $type: 'Number', value: 'Infinity' },
    });
    expect(stored.response).toBeNull();
    expect(stored.error).toEqual({
      name: 'PaymentDeclined',
      message: 'Karte abgelehnt',
    });
  });

  it('keeps a pending row from begin and completes it under the same id', async () => {
    const sink = new PostgresAuditSink(pool);
    const id = '0199a1b2-0000-7000-8000-000000000004';
    const {
      outcome: _outcome,
      response: _response,
      durationMs: _durationMs,
      ...started
    } = record(id);

    await sink.begin({ ...started, outcome: 'pending' });

    const pending = await row(id);
    expect(pending.outcome).toBe('pending');
    expect(pending.payload).toEqual(richPayload);
    expect(pending.duration_ms).toBeNull();
    expect(pending.completed_at).toBeNull();

    await sink.write(record(id));

    const completed = await row(id);
    expect(completed.outcome).toBe('success');
    expect(completed.response).toEqual({ orderId: 'o-1' });
    expect(completed.duration_ms).toBe(12.75);
    expect(completed.completed_at).toBeInstanceOf(Date);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM audit_log WHERE id = $1',
      [id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('writes to a schema-qualified table', async () => {
    await pool.query('CREATE SCHEMA IF NOT EXISTS audit');
    await pool.query(createAuditTableSql('audit.audit_log'));
    const sink = new PostgresAuditSink(pool, { table: 'audit.audit_log' });
    const id = '0199a1b2-0000-7000-8000-000000000003';

    await sink.write(record(id));

    const { rows } = await pool.query(
      'SELECT payload FROM audit.audit_log WHERE id = $1',
      [id],
    );
    expect(rows[0].payload).toEqual(richPayload);
  });
});

describe('PostgresDeadLetterTransport against PostgreSQL', () => {
  const record = (
    correlationId: string,
    overrides: Partial<DeadLetterRecord> = {},
  ): DeadLetterRecord => ({
    id: uuidv7(),
    correlationId,
    tenantId: 'tenant-a',
    requestKind: 'command',
    requestName: 'CreateOrderCommand',
    handlerName: 'CreateOrderHandler',
    payload: richPayload,
    error: {
      name: 'TimeoutError',
      message: 'Zeitüberschreitung nach 30 s',
      stack: 'TimeoutError: Zeitüberschreitung\n    at handler',
    },
    failedAt: '2026-09-25T08:00:00.000Z',
    metadata: { attempt: 3, tenantId: 'tenant-a' },
    attempts: 0,
    status: 'open',
    payloadRedacted: false,
    ...overrides,
  });

  it('keeps a record to list, count attempts on and resolve', async () => {
    const store = new PostgresDeadLetterTransport(pool);
    const captured = record('dl-store', { requestName: 'StoreRoundTripEvent' });

    await store.send(captured);
    await store.recordAttempt(captured.id, { name: 'Error', message: 'again' });

    const [open] = await store.list({
      status: 'open',
      requestName: 'StoreRoundTripEvent',
    });
    expect(open).toMatchObject({
      id: captured.id,
      tenantId: 'tenant-a',
      payload: richPayload,
      attempts: 1,
      lastError: { name: 'Error', message: 'again' },
      failedAt: '2026-09-25T08:00:00.000Z',
    });

    await store.markResolved(captured.id);
    const resolved = await store.get(captured.id);
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.resolvedAt).toEqual(expect.any(String));
    await expect(
      store.list({ status: 'open', requestName: 'StoreRoundTripEvent' }),
    ).resolves.toEqual([]);
  });

  const row = async (correlationId: string) =>
    (
      await pool.query('SELECT * FROM dead_letters WHERE correlation_id = $1', [
        correlationId,
      ])
    ).rows[0];

  it('stores arrays, nested objects and non-ASCII text unchanged', async () => {
    const transport = new PostgresDeadLetterTransport(pool);

    await transport.send(record('dl-1'));

    const stored = await row('dl-1');
    expect(stored.payload).toEqual(richPayload);
    expect(stored.error).toEqual({
      name: 'TimeoutError',
      message: 'Zeitüberschreitung nach 30 s',
      stack: 'TimeoutError: Zeitüberschreitung\n    at handler',
    });
    expect(stored.metadata).toEqual({ attempt: 3, tenantId: 'tenant-a' });
    expect(stored.request_kind).toBe('command');
    expect((stored.failed_at as Date).toISOString()).toBe(
      '2026-09-25T08:00:00.000Z',
    );
  });

  it('stores a missing payload as JSON null and missing metadata as SQL NULL', async () => {
    const transport = new PostgresDeadLetterTransport(pool);

    await transport.send(
      record('dl-2', { payload: undefined, metadata: undefined }),
    );

    const { rows } = await pool.query(
      "SELECT jsonb_typeof(payload) AS payload_type, metadata IS NULL AS no_metadata FROM dead_letters WHERE correlation_id = 'dl-2'",
    );
    expect(rows[0]).toEqual({ payload_type: 'null', no_metadata: true });
  });

  it('writes to a schema-qualified table', async () => {
    await pool.query('CREATE SCHEMA IF NOT EXISTS ops');
    await pool.query(createDeadLetterTableSql('ops.dead_letters'));
    const transport = new PostgresDeadLetterTransport(pool, {
      table: 'ops.dead_letters',
    });

    await transport.send(record('dl-3'));

    const { rows } = await pool.query(
      "SELECT payload FROM ops.dead_letters WHERE correlation_id = 'dl-3'",
    );
    expect(rows[0].payload).toEqual(richPayload);
  });
});

describe('characters jsonb cannot hold', () => {
  it.each([
    ['a NUL character', 'before\u0000after', 'before\ufffdafter'],
    ['a lone surrogate', 'broken \ud800 text', 'broken \ufffd text'],
  ])(
    'keeps the record and stores %s as U+FFFD',
    async (label, text, stored) => {
      const correlationId = `unsupported-${label}`;
      const id = uuidv7();

      await new PostgresDeadLetterTransport(pool).send({
        id: uuidv7(),
        correlationId,
        requestKind: 'command',
        requestName: 'ImportFileCommand',
        handlerName: 'ImportFileHandler',
        payload: { text, [`key ${text}`]: 1 },
        error: { name: 'ParseError', message: text },
        failedAt: '2026-09-25T08:00:00.000Z',
        attempts: 0,
        status: 'open',
        payloadRedacted: false,
      });
      await new PostgresAuditSink(pool).write({
        id,
        correlationId,
        action: 'file.import',
        severity: 'low',
        outcome: 'failure',
        requestKind: 'command',
        requestName: 'ImportFileCommand',
        handlerName: 'ImportFileHandler',
        payload: { text },
        error: { name: 'ParseError', message: text },
        durationMs: 1,
        timestamp: '2026-09-25T08:00:00.000Z',
      });

      const deadLetter = (
        await pool.query(
          'SELECT payload, error FROM dead_letters WHERE correlation_id = $1',
          [correlationId],
        )
      ).rows[0];
      expect(deadLetter.payload).toEqual({
        text: stored,
        [`key ${stored}`]: 1,
      });
      expect(deadLetter.error.message).toBe(stored);
      const audit = (
        await pool.query('SELECT payload, error FROM audit_log WHERE id = $1', [
          id,
        ])
      ).rows[0];
      expect(audit.payload).toEqual({ text: stored });
      expect(audit.error.message).toBe(stored);
    },
  );
});
