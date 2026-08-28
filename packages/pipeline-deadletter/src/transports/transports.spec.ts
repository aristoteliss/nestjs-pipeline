/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { describe, expect, it, vi } from 'vitest';
import type { DeadLetterRecord } from '../interfaces/dead-letter-transport.interface';
import { BullMqDeadLetterTransport } from './bullmq.transport';
import {
  createDeadLetterTableSql,
  PostgresDeadLetterTransport,
} from './postgres.transport';
import { RabbitMqDeadLetterTransport } from './rabbitmq.transport';

const record: DeadLetterRecord = {
  correlationId: 'corr-1',
  requestKind: 'command',
  requestName: 'CreateUserCommand',
  handlerName: 'CreateUserHandler',
  payload: { username: 'neo' },
  error: { name: 'Error', message: 'boom' },
  failedAt: '2026-01-01T00:00:00.000Z',
  metadata: { tenant: 'acme' },
};

describe('BullMqDeadLetterTransport', () => {
  it('adds a job with the default name and options', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    await new BullMqDeadLetterTransport({ add }).send(record);

    expect(add).toHaveBeenCalledWith('dead-letter', record, {
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 1,
    });
  });

  it('honors a custom job name and options', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    await new BullMqDeadLetterTransport(
      { add },
      { jobName: 'dlq', jobOptions: { attempts: 3 } },
    ).send(record);

    expect(add).toHaveBeenCalledWith('dlq', record, { attempts: 3 });
  });
});

describe('RabbitMqDeadLetterTransport', () => {
  it('publishes a persistent JSON message with sane defaults', async () => {
    const publish = vi.fn().mockReturnValue(true);
    await new RabbitMqDeadLetterTransport({ publish }).send(record);

    const [exchange, routingKey, content, options] = publish.mock.calls[0];
    expect(exchange).toBe('');
    expect(routingKey).toBe('dead-letter');
    expect(JSON.parse((content as Buffer).toString())).toEqual(record);
    expect(options).toMatchObject({
      persistent: true,
      contentType: 'application/json',
      correlationId: 'corr-1',
    });
  });

  it('routes to a custom exchange/routingKey', async () => {
    const publish = vi.fn().mockReturnValue(true);
    await new RabbitMqDeadLetterTransport(
      { publish },
      { exchange: 'dlx', routingKey: 'failed' },
    ).send(record);

    const [exchange, routingKey] = publish.mock.calls[0];
    expect(exchange).toBe('dlx');
    expect(routingKey).toBe('failed');
  });

  it('waits for drain when publish reports backpressure', async () => {
    const publish = vi.fn().mockReturnValue(false);
    const once = vi.fn((event: string, listener: () => void) => {
      expect(event).toBe('drain');
      queueMicrotask(listener);
    });

    await expect(
      new RabbitMqDeadLetterTransport({ publish, once }).send(record),
    ).resolves.toBeUndefined();
    expect(once).toHaveBeenCalledOnce();
  });
});

describe('PostgresDeadLetterTransport', () => {
  it('inserts a parameterized row into the default table', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    await new PostgresDeadLetterTransport({ query }).send(record);

    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('INSERT INTO dead_letters');
    expect(values).toEqual([
      'corr-1',
      'command',
      'CreateUserCommand',
      'CreateUserHandler',
      JSON.stringify({ username: 'neo' }),
      JSON.stringify(record.error),
      JSON.stringify({ tenant: 'acme' }),
      '2026-01-01T00:00:00.000Z',
    ]);
  });

  it('accepts a schema-qualified table', async () => {
    const query = vi.fn().mockResolvedValue({});
    await new PostgresDeadLetterTransport(
      { query },
      {
        table: 'audit.dead_letters',
      },
    ).send(record);

    expect(query.mock.calls[0][0]).toContain('INSERT INTO audit.dead_letters');
  });

  it('rejects unsafe table identifiers (SQL injection guard)', () => {
    const query = vi.fn();
    expect(
      () =>
        new PostgresDeadLetterTransport(
          { query },
          {
            table: 'dl; DROP TABLE users; --',
          },
        ),
    ).toThrow(/Invalid dead-letter table name/);
  });

  it('createDeadLetterTableSql emits CREATE TABLE for a valid name', () => {
    expect(createDeadLetterTableSql()).toContain(
      'CREATE TABLE IF NOT EXISTS dead_letters',
    );
    expect(() => createDeadLetterTableSql('bad name')).toThrow(
      /Invalid dead-letter table name/,
    );
  });
});
