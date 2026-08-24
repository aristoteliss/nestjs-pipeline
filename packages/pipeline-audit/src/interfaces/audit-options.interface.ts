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

import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import type {
  AuditActor,
  AuditRequestKind,
  AuditSeverity,
} from './audit-record.interface';
import type { AuditSink } from './audit-sink.interface';

/** Resolves the acting principal from the pipeline context. */
export type AuditActorFactory = (
  context: IPipelineContext,
) => AuditActor | undefined;

/** Produces extra, request-aware metadata to attach to an audit record. */
export type AuditMetadataFactory = (
  context: IPipelineContext,
) => Record<string, unknown>;

/** Custom redactor replacing a raw payload/response with a safe-to-store value. */
export type AuditRedactor = (value: unknown) => unknown;

/**
 * Per-handler (and module-default) options for {@link AuditBehavior}.
 *
 * Supplied per handler via `@UsePipeline([AuditBehavior, { ... }])`,
 * shallow-merged over the module-wide defaults (handler keys win).
 */
export interface AuditBehaviorOptions {
  /**
   * Logical action name recorded on the entry (e.g. `user.create`).
   * Default: `context.requestName`.
   */
  action?: string;
  /**
   * Severity recorded on the entry. Default: `'medium'`, or `'low'` for queries.
   */
  severity?: AuditSeverity;
  /**
   * Resolve the acting principal — typically reads an id from `context.items`
   * set by an upstream auth behavior, e.g.
   * `actor: (c) => ({ id: c.items.get('currentUserId') })`.
   */
  actor?: AuditActorFactory;
  /**
   * Record the (redacted) request payload. Default `true`. Set `false` for
   * high-volume or sensitive handlers where the action alone is enough.
   */
  captureRequest?: boolean;
  /**
   * Record the (redacted) handler response. Default `false` — responses are
   * often large and rarely needed for an audit trail.
   */
  captureResponse?: boolean;
  /**
   * Restrict auditing to specific request kinds. When omitted, every kind is
   * audited. Example: `['command', 'event']` to skip read-side queries.
   */
  captureKinds?: AuditRequestKind[];
  /**
   * Case-insensitive payload/response field names whose values are masked with
   * `'[REDACTED]'` before storage. Merged with the built-in defaults
   * (`password`, `token`, `secret`, …). Set `redact` for full control.
   */
  redactKeys?: string[];
  /**
   * Full custom redaction of the payload/response, replacing the built-in
   * key-masking. Receives the raw value, returns the safe-to-store value.
   */
  redact?: AuditRedactor;
  /** Produce extra metadata to merge into the audit record. */
  metadata?: AuditMetadataFactory;
  /**
   * Include the error stack trace on failure records. Default `true`.
   */
  includeStack?: boolean;
  /**
   * When the sink itself throws (e.g. the audit DB is down), allow the request
   * to continue (`true`, default) or surface the sink error (`false`).
   * Fail-open favors availability; fail-closed favors a guaranteed audit trail.
   */
  failOpen?: boolean;
}

/** Options for {@link AuditModule.forRoot}. */
export interface AuditModuleOptions {
  /**
   * The audit sink. Pass a bundled sink ({@link LogAuditSink},
   * {@link PostgresAuditSink}) or your own {@link AuditSink}. Defaults to
   * {@link LogAuditSink} for zero-config logging.
   */
  sink?: AuditSink;
  /** Module-wide default options merged under each handler's options. */
  defaults?: AuditBehaviorOptions;
}

/**
 * Options for {@link AuditModule.forRootAsync} — build the sink from injected
 * dependencies (e.g. a DI-managed pg `Pool` or Kafka producer).
 */
export interface AuditModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /** Factory returning the {@link AuditSink} (may be async). */
  useFactory: (...args: never[]) => AuditSink | Promise<AuditSink>;
  /** Providers injected into `useFactory`. */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /** Module-wide default options merged under each handler's options. */
  defaults?: AuditBehaviorOptions;
}
