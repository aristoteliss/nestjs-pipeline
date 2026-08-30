import {
  AuditBehavior,
  type AuditBehaviorOptions,
  buildAuditRecord,
  REDACTED,
} from '@nestjs-pipeline/audit';
import {
  getBehaviorId,
  type IPipelineContext,
  LoggingBehavior,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
} from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { CreateAuthCommand } from './create-auth.command';
import { CreateAuthHandler } from './create-auth.handler';

describe('CreateAuthHandler secret redaction', () => {
  const options = Reflect.getMetadata(
    PIPELINE_BEHAVIORS_OPTIONS_METADATA,
    CreateAuthHandler,
  ) as Map<string, Record<string, unknown>>;

  it('keeps request logging payloads excluded', () => {
    const logging = options.get(getBehaviorId(LoggingBehavior));
    expect(logging?.excludeRequestObj ?? true).toBe(true);
  });

  it('redacts the login code from audit payloads', () => {
    const audit = options.get(
      getBehaviorId(AuditBehavior),
    ) as AuditBehaviorOptions;
    const request = new CreateAuthCommand({
      email: 'alice@example.test',
      code: '123456',
    });
    const record = buildAuditRecord({
      context: {
        correlationId: 'corr-1',
        requestKind: 'command',
        requestName: 'CreateAuthCommand',
        handlerName: 'CreateAuthHandler',
        request,
      } as IPipelineContext,
      options: audit,
      failed: false,
      durationMs: 1,
      startedAt: new Date().toISOString(),
    });

    expect(record.payload).toEqual({
      email: 'alice@example.test',
      code: REDACTED,
    });
  });
});
