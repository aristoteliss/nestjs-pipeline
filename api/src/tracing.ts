/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { otlpConfig } from './common/environment/otlp.config.js';

const { serviceName, endpoint } = otlpConfig();

const sdk = new NodeSDK({
  serviceName,
  traceExporter: new OTLPTraceExporter({ url: endpoint }),
  instrumentations: [
    new HttpInstrumentation(), // HTTP/HTTPS in & out
    new PgInstrumentation(), // PostgreSQL queries
  ],
});

sdk.start();

/** Flushes pending telemetry and stops the SDK; `ServerModule` calls it on shutdown. */
export function shutdownTracing(): Promise<void> {
  return sdk.shutdown();
}
