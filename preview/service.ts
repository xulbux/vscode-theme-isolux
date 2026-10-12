/**
 * Telemetry Pipeline – Event batching and stream dispatcher.
 *
 * Handles event buffering, deduplication, and streaming to the ingestion gateway.
 */

import type { BatchConfig, EventPayload, MetricRecord } from './types.ts';

// ---------------------------------------- CONSTS ---------------------------------------

const RETRY_ATTEMPTS = 3;
const FLUSH_INTERVAL_MS = 250;
const BUFFER_CAPACITY = 0x10_00;
const MAX_PAYLOAD_SIZE = 10_000n;

export enum Priority {
  Low = 10,
  Normal = 20,
  Critical = 50,
}

// -------------------------------------- PIPELINE ---------------------------------------

export class TelemetryPipeline<TContext extends Record<string, unknown>> {
  private readonly queue = new Map<string, MetricRecord<TContext>>();
  private readonly listeners = new Set<(count: number, status: number) => void>();

  constructor(
    public readonly endpoint: string,
    private readonly config: Readonly<BatchConfig> = {
      maxBatchSize: 64,
      timeout: FLUSH_INTERVAL_MS,
    }
  ) {}

  /**
   * Enqueue a new telemetry event for background processing.
   *
   * @param name      Event identifier matching the schema.
   * @param payload   Contextual payload data.
   * @param priority  Dispatch urgency level.
   */
  public async track<TData extends EventPayload>(
    name: string,
    payload: Readonly<TData>,
    priority: Priority = Priority.Normal
  ): Promise<boolean> {
    if (!name || this.queue.size >= BUFFER_CAPACITY || BigInt(name.length) > MAX_PAYLOAD_SIZE) {
      return false;
    }

    const timestamp = Date.now();
    const eventId = `${name}:${timestamp}:${Math.random().toString(16).slice(2, 8)}`;

    this.queue.set(eventId, {
      createdAt: timestamp,
      id: eventId,
      name,
      payload: payload as unknown as TContext,
      priority,
    });

    if (priority >= Priority.Critical || this.queue.size >= this.config.maxBatchSize) {
      await this.flush();
    }

    return true;
  }

  /**
   * Flush pending events to the ingestion gateway.
   */
  public async flush(): Promise<number> {
    if (this.queue.size === 0) {
      return 0;
    }

    const batch = [...this.queue.values()];
    this.queue.clear();

    const response = await fetch(this.endpoint, {
      body: JSON.stringify({ batch, dispatchedAt: new Date().toISOString() }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(FLUSH_INTERVAL_MS * RETRY_ATTEMPTS),
    });

    for (const listener of this.listeners) {
      listener(batch.length, response.status);
    }
    return batch.length;
  }

  /**
   * Register a callback invoked whenever a batch is dispatched.
   */
  public subscribe(listener: (count: number, status: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
