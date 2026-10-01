/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { DiscoveryService } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { CommandHandler, EventsHandler, QueryHandler } from '@nestjs/cqrs';

/** Handler providers, grouped by the bus Nest CQRS registers them with. */
export interface CqrsHandlers {
  commands: InstanceWrapper[];
  queries: InstanceWrapper[];
  events: InstanceWrapper[];
}

// @nestjs/cqrs keeps its handler metadata keys private, so each public handler
// decorator is applied to a throwaway class to read the one key it records.
function metadataKey(
  decorator: string,
  decorate: (target: new () => object) => unknown,
): unknown {
  const target = class {};
  decorate(target);
  const keys: unknown[] = Reflect.getOwnMetadataKeys(target);
  if (keys.length !== 1) {
    throw new Error(
      `@${decorator} recorded ${keys.length} metadata keys instead of one, so the ` +
        'pipeline cannot recognize its handlers. The installed @nestjs/cqrs is not supported.',
    );
  }
  return keys[0];
}

/**
 * Lists the application's command, query and event handler providers: the
 * set Nest CQRS registers with its buses.
 *
 * A provider is a handler when its class carries the metadata that
 * `@CommandHandler`, `@QueryHandler` or `@EventsHandler` records, read from
 * the live instance's class or, for a provider without a static instance such
 * as a request-scoped one, from the registered class. Inherited metadata
 * counts, as it does in Nest CQRS.
 *
 * @param discovery - The application's `DiscoveryService`.
 * @returns The handler providers of every module, grouped by kind.
 * @throws Error when a handler decorator does not record exactly one metadata
 *   key, which means the installed `@nestjs/cqrs` is not supported.
 *
 * @example
 * ```ts
 * const { commands, queries, events } = discoverHandlers(discoveryService);
 * ```
 */
export function discoverHandlers(discovery: DiscoveryService): CqrsHandlers {
  const providers = discovery.getProviders();
  const withMetadata = (key: unknown) =>
    providers.filter((wrapper) => {
      const type = wrapper.instance?.constructor ?? wrapper.metatype;
      return Boolean(type && Reflect.getMetadata(key, type));
    });

  return {
    commands: withMetadata(
      metadataKey('CommandHandler', (target) =>
        CommandHandler(class {})(target),
      ),
    ),
    queries: withMetadata(
      metadataKey('QueryHandler', (target) => QueryHandler(class {})(target)),
    ),
    events: withMetadata(
      metadataKey('EventsHandler', (target) => EventsHandler(class {})(target)),
    ),
  };
}
