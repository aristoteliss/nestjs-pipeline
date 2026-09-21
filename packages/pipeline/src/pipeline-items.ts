/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingPipelineItemError } from './errors/missing-pipeline-item.error';
import type { IPipelineContext } from './interfaces/pipeline.context.interface';

/** Associates a context map key with its compile-time value type. */
export interface PipelineItemToken<T> {
  readonly key: string | symbol;
  readonly name: string;
  readonly __itemType?: T;
}

/** Creates a unique symbol-backed token, or wraps an existing interoperability key. */
export function createPipelineItem<T>(
  name: string,
  key: string | symbol = Symbol(name),
): PipelineItemToken<T> {
  return { key, name };
}

function itemKey<T>(
  token: PipelineItemToken<T> | string | symbol,
): string | symbol {
  return typeof token === 'object' ? token.key : token;
}

/** Reads an item without runtime type validation. Raw keys require a caller-supplied type. */
export function getPipelineItem<T>(
  context: IPipelineContext,
  token: PipelineItemToken<T> | string | symbol,
): T | undefined {
  return context.items.get(itemKey(token)) as T | undefined;
}

/** Writes an item using the token's value type; raw keys remain unchecked. */
export function setPipelineItem<T>(
  context: IPipelineContext,
  token: PipelineItemToken<T> | string | symbol,
  value: NoInfer<T>,
): void {
  context.items.set(itemKey(token), value);
}

/**
 * Reads a required item, throwing MissingPipelineItemError for absent or undefined values.
 * Null and other falsy values are returned unchanged. No runtime type validation occurs.
 * The optional custom message supplements the item, request and handler diagnostic.
 */
export function requirePipelineItem<T>(
  context: IPipelineContext,
  token: PipelineItemToken<T> | string | symbol,
  customMessage?: string,
): T {
  const value = getPipelineItem(context, token);
  if (value === undefined) {
    throw new MissingPipelineItemError(
      typeof token === 'object' ? token.name : String(token),
      context.requestName,
      context.handlerName,
      customMessage,
    );
  }
  return value;
}

/** Checks key presence, including entries explicitly set to undefined. */
export function hasPipelineItem<T>(
  context: IPipelineContext,
  token: PipelineItemToken<T> | string | symbol,
): boolean {
  return context.items.has(itemKey(token));
}
