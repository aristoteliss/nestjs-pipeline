/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { setTenantResolver } from '@cqrs-ddd/core/application';
import { cacheKey } from '@cqrs-ddd/core/persistence';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { Test } from '@nestjs/testing';
import { PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import { pinoHttp } from 'pino-http';
import { describe, expect, it } from 'vitest';
import { ObservabilityModule } from './observability.module.js';

async function configuredRedaction() {
  const moduleRef = await Test.createTestingModule({
    imports: [ObservabilityModule],
  }).compile();
  const { pinoHttp: options } = moduleRef.get<Params>(PARAMS_PROVIDER_TOKEN);
  await moduleRef.close();
  return (options as { redact: { paths: string[]; censor: string } }).redact;
}

describe('ObservabilityModule tenant resolver', () => {
  it('gives the tenant-scoped cache keys the current tenant', () => {
    setTenantResolver(undefined);
    new ObservabilityModule();

    const key = runWithTenant('tenant_a', () => cacheKey('user', { id: '1' }));

    expect(key).toMatch(/^tenant_a:user:v1:[a-f0-9]{64}$/);
  });
});

describe('ObservabilityModule HTTP logger redaction', () => {
  it('redacts authorization, cookie, and API client headers from emitted log records', async () => {
    const logs: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logs.push(chunk.toString());
        callback();
      },
    });

    const httpLogger = pinoHttp(
      { redact: await configuredRedaction() },
      stream,
    );

    const syntheticBearer = 'Bearer super-secret-jwt-token-xyz';
    const syntheticCookie = 'session=super-secret-cookie-val-123';
    const syntheticApiKey = 'secret-api-key-999';
    const syntheticApiId = 'secret-api-client-id';

    const req = {
      method: 'POST',
      url: '/users',
      headers: {
        host: 'api.example.test',
        authorization: syntheticBearer,
        cookie: syntheticCookie,
        'x-api-key': syntheticApiKey,
        'x-api-id': syntheticApiId,
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
    expect(combinedLogOutput).not.toContain(syntheticApiId);
    expect(combinedLogOutput).not.toContain('new-secret-cookie-val');

    // Headers must be censored as [REDACTED]
    const parsed = JSON.parse(logs[0]);
    expect(parsed.req.headers.authorization).toBe('[REDACTED]');
    expect(parsed.req.headers.cookie).toBe('[REDACTED]');
    expect(parsed.req.headers['x-api-key']).toBe('[REDACTED]');
    expect(parsed.req.headers['x-api-id']).toBe('[REDACTED]');

    // Non-sensitive headers must remain intact
    expect(parsed.req.headers.host).toBe('api.example.test');
    expect(parsed.req.headers['user-agent']).toBe('vitest-agent');
  });
});
