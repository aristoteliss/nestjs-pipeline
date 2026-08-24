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

import { describe, expect, it } from 'vitest';
import { AuditBehavior } from './audit.behavior';
import { AuditModule } from './audit.module';
import { AUDIT_DEFAULT_OPTIONS, AUDIT_SINK } from './constants/tokens';
import type { AuditSink } from './interfaces/audit-sink.interface';
import { LogAuditSink } from './sinks/log.sink';

describe('AuditModule', () => {
  it('registers globally via forRoot with default LogAuditSink', () => {
    const dynamicModule = AuditModule.forRoot();

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.module).toBe(AuditModule);
    expect(dynamicModule.exports).toEqual([
      AuditBehavior,
      AUDIT_SINK,
      AUDIT_DEFAULT_OPTIONS,
    ]);

    const sinkProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === AUDIT_SINK,
    ) as any;
    expect(sinkProvider?.useValue).toBeInstanceOf(LogAuditSink);
  });

  it('registers globally via forRoot with custom sink and defaults', () => {
    const customSink: AuditSink = { write: async () => {} };
    const dynamicModule = AuditModule.forRoot({
      sink: customSink,
      defaults: { captureRequest: true },
    });

    const sinkProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === AUDIT_SINK,
    ) as any;
    const defaultsProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === AUDIT_DEFAULT_OPTIONS,
    ) as any;

    expect(sinkProvider?.useValue).toBe(customSink);
    expect(defaultsProvider?.useValue).toEqual({ captureRequest: true });
  });

  it('registers globally via forRootAsync with factory', () => {
    const factory = () => new LogAuditSink();
    const dynamicModule = AuditModule.forRootAsync({
      useFactory: factory,
      defaults: { captureResponse: false },
    });

    expect(dynamicModule.global).toBe(true);
    const sinkProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === AUDIT_SINK,
    ) as any;
    expect(sinkProvider?.useFactory).toBe(factory);
  });
});
