/**
 * Shared type definitions for the telemetry pipeline.
 */

export interface BatchConfig {
  readonly maxBatchSize: number;
  readonly timeout: number;
}

export type EventPayload = Readonly<Record<string, unknown>>;

export interface MetricRecord<T = unknown> {
  readonly id: string;
  readonly name: string;
  readonly payload: T;
  readonly priority: number;
  readonly createdAt: number;
}
