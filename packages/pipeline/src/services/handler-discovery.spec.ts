/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CommandHandler, EventsHandler, QueryHandler } from '@nestjs/cqrs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverHandlers } from './handler-discovery.js';

class CreateCommand {}
class RenameCommand {}
class ArchiveCommand {}
class FindQuery {}
class CreatedEvent {}
class RenamedEvent {}

@CommandHandler(CreateCommand)
class CreateHandler {
  async execute() {
    return 'created';
  }
}

@CommandHandler(RenameCommand)
class RenameHandler {
  async execute() {
    return 'renamed';
  }
}

@CommandHandler(ArchiveCommand)
class ArchiveHandler {
  async execute() {
    return 'archived';
  }
}

@QueryHandler(FindQuery)
class FindHandler {
  async execute() {
    return 'found';
  }
}

@EventsHandler(CreatedEvent, RenamedEvent)
class AuditHandler {
  handle() {}
}

class PlainService {}

function discovery(...wrappers: object[]) {
  return { getProviders: () => wrappers } as never;
}

describe('discoverHandlers', () => {
  afterEach(() => {
    vi.doUnmock('@nestjs/cqrs');
    vi.resetModules();
  });

  it('groups providers by the handler decorator their class carries', () => {
    const singleton = {
      instance: new CreateHandler(),
      metatype: CreateHandler,
    };
    const scoped = { instance: undefined, metatype: RenameHandler };
    const factory = {
      instance: new ArchiveHandler(),
      metatype: () => new ArchiveHandler(),
    };
    const query = { instance: new FindHandler(), metatype: FindHandler };
    const event = { instance: new AuditHandler(), metatype: AuditHandler };
    const plain = { instance: new PlainService(), metatype: PlainService };
    const value = { instance: Object.create(null), metatype: null };

    const handlers = discoverHandlers(
      discovery(singleton, plain, scoped, query, value, event, factory),
    );

    expect(handlers).toEqual({
      commands: [singleton, scoped, factory],
      queries: [query],
      events: [event],
    });
  });

  it('recognizes a subclass of a decorated handler, as Nest CQRS does', () => {
    class ExtendedCreateHandler extends CreateHandler {}
    const wrapper = {
      instance: new ExtendedCreateHandler(),
      metatype: ExtendedCreateHandler,
    };

    expect(discoverHandlers(discovery(wrapper)).commands).toEqual([wrapper]);
  });

  it('fails when a handler decorator does not record exactly one metadata key', async () => {
    vi.resetModules();
    vi.doMock('@nestjs/cqrs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@nestjs/cqrs')>()),
      QueryHandler: () => () => undefined,
    }));
    const { discoverHandlers: discover } = await import(
      './handler-discovery.js'
    );

    expect(() => discover(discovery())).toThrow(
      '@QueryHandler recorded 0 metadata keys instead of one',
    );
  });
});
