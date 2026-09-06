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

import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import pinoHttp from 'pino-http';
import { describe, expect, it } from 'vitest';
import { HTTP_LOG_REDACT_PATHS } from './observability.module';

describe('ObservabilityModule HTTP logger redaction', () => {
  it('defines redaction paths for all credential headers', () => {
    expect(HTTP_LOG_REDACT_PATHS).toContain('req.headers.authorization');
    expect(HTTP_LOG_REDACT_PATHS).toContain('req.headers.cookie');
    expect(HTTP_LOG_REDACT_PATHS).toContain('req.headers["x-api-key"]');
    expect(HTTP_LOG_REDACT_PATHS).toContain('req.headers["x-api-id"]');
    expect(HTTP_LOG_REDACT_PATHS).toContain('req.headers["set-cookie"]');
    expect(HTTP_LOG_REDACT_PATHS).toContain('res.headers["set-cookie"]');
  });

  it('redacts authorization, cookie, and api-key headers from emitted log records', () => {
    const logs: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logs.push(chunk.toString());
        callback();
      },
    });

    const httpLogger = pinoHttp(
      {
        redact: {
          paths: HTTP_LOG_REDACT_PATHS,
          censor: '[REDACTED]',
        },
      },
      stream,
    );

    const syntheticBearer = 'Bearer super-secret-jwt-token-xyz';
    const syntheticCookie = 'session=super-secret-cookie-val-123';
    const syntheticApiKey = 'secret-api-key-999';

    const req = {
      method: 'POST',
      url: '/users',
      headers: {
        host: 'api.example.test',
        authorization: syntheticBearer,
        cookie: syntheticCookie,
        'x-api-key': syntheticApiKey,
        'user-agent': 'vitest-agent',
      },
    } as any;

    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headers: {
        'set-cookie': 'session=new-secret-cookie-val',
      } as Record<string, string>,
      getHeader(name: string) {
        return (this.headers as Record<string, string>)[name.toLowerCase()];
      },
    }) as any;

    httpLogger(req, res);
    res.emit('finish');

    expect(logs.length).toBeGreaterThan(0);
    const combinedLogOutput = logs.join('\n');

    // Secrets must NOT leak into the emitted logs
    expect(combinedLogOutput).not.toContain(syntheticBearer);
    expect(combinedLogOutput).not.toContain(syntheticCookie);
    expect(combinedLogOutput).not.toContain(syntheticApiKey);
    expect(combinedLogOutput).not.toContain('new-secret-cookie-val');

    // Headers must be censored as [REDACTED]
    const parsed = JSON.parse(logs[0]);
    expect(parsed.req.headers.authorization).toBe('[REDACTED]');
    expect(parsed.req.headers.cookie).toBe('[REDACTED]');
    expect(parsed.req.headers['x-api-key']).toBe('[REDACTED]');

    // Non-sensitive headers must remain intact
    expect(parsed.req.headers.host).toBe('api.example.test');
    expect(parsed.req.headers['user-agent']).toBe('vitest-agent');
  });
});
