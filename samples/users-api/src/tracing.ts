import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

const sdk = new NodeSDK({
  serviceName: process.env['OTEL_SERVICE_NAME'] ?? 'users-api',
  traceExporter: new OTLPTraceExporter({
    // Override with OTEL_EXPORTER_OTLP_ENDPOINT env var in production.
    // SigNoz default: http://localhost:4317
    // Datadog Agent: http://localhost:4317 (with otlp_config enabled)
    url: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4317',
  }),
  instrumentations: [
    new HttpInstrumentation(),         // HTTP/HTTPS in & out
    new PgInstrumentation(),           // PostgreSQL queries
    new NestInstrumentation(),         // NestJS request lifecycle
  ],
});

sdk.start();

// Ensure SDK flushes all pending spans before the process exits.
process.on('SIGTERM', () => sdk.shutdown());
process.on('SIGINT', () => sdk.shutdown());
