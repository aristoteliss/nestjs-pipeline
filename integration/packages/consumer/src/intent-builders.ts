/* Copyright (C) 2026-present Aristotelis — see repository license. */

/// <reference types="node" />

import 'reflect-metadata';
import assert from 'node:assert/strict';
import {
  LoggingBehavior,
  logging,
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
  UsePipeline,
} from '@nestjs-pipeline/core';
import { DeadLetterBehavior, deadLetter } from '@nestjs-pipeline/deadletter';
import {
  MetricsBehavior,
  metrics,
  TraceBehavior,
  trace,
} from '@nestjs-pipeline/opentelemetry';

const logOptions = {
  requestResponseLogLevel: 'none',
  mapLogLevel: new Map<typeof Error, 'warn'>([[Error, 'warn']]),
} as const;
const metricOptions = { enabled: false };
const traceOptions = { spanName: () => 'consumer.operation' };
const deadLetterOptions = { rethrow: false };

class WithBuilders {}
UsePipeline(
  logging(logOptions),
  metrics(metricOptions),
  trace(traceOptions),
  deadLetter(deadLetterOptions),
)(WithBuilders);

class WithTuples {}
UsePipeline(
  [LoggingBehavior, logOptions],
  [MetricsBehavior, metricOptions],
  [TraceBehavior, traceOptions],
  [DeadLetterBehavior, deadLetterOptions],
)(WithTuples);

for (const key of [
  PIPELINE_BEHAVIORS_METADATA,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
]) {
  assert.deepEqual(
    Reflect.getMetadata(key, WithBuilders),
    Reflect.getMetadata(key, WithTuples),
  );
}

for (const build of [logging, metrics, trace, deadLetter]) {
  const first = build();
  const second = build();
  assert.deepEqual(first[1], {});
  assert.notEqual(first[1], second[1]);
}

// @ts-expect-error Nest log levels do not include info.
logging({ requestResponseLogLevel: 'info' });
// @ts-expect-error Metrics activation must be boolean.
metrics({ enabled: 'false' });
// @ts-expect-error Span factories must return a string.
trace({ spanName: () => 42 });
// @ts-expect-error Error propagation must be boolean.
deadLetter({ rethrow: 'false' });
// @ts-expect-error Unknown option keys must be rejected.
logging({ unknownOption: true });
