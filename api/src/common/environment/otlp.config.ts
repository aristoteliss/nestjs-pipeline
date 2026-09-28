/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Where traces are exported, and under which service name. */
export interface OtlpConfig {
  readonly serviceName: string;
  /** The OTLP/gRPC endpoint of the collector. */
  readonly endpoint: string;
}

/**
 * The OpenTelemetry exporter settings: the one place the application reads
 * them. `OTEL_SERVICE_NAME` defaults to `users-api` and
 * `OTEL_EXPORTER_OTLP_ENDPOINT` to `http://localhost:4317`; an empty value
 * counts as unset.
 *
 * @example
 * ```ts
 * const { serviceName, endpoint } = otlpConfig();
 * new NodeSDK({ serviceName, traceExporter: new OTLPTraceExporter({ url: endpoint }) });
 * ```
 */
export function otlpConfig(): OtlpConfig {
  return {
    serviceName: process.env.OTEL_SERVICE_NAME?.trim() || 'users-api',
    endpoint:
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() ||
      'http://localhost:4317',
  };
}
