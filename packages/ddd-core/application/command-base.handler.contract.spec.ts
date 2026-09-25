/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * `CommandBaseHandler` publishes buffered aggregate events based on the *shape*
 * of what `handle()` returns, so that shape is a type constraint: a handler that
 * mutates an aggregate and returns a DTO does not compile, rather than silently
 * dropping every event it raised. These tests pin both halves: the constraint
 * itself, and the publication semantics that depend on it.
 */

import { describe, expect, it, vi } from 'vitest';
import { AggregateRoot } from '../domain/models/aggregate-root';
import { CommandBaseHandler } from './command-base.handler';

class ThingCreated {
  constructor(readonly id: string) {}
}

class Thing extends AggregateRoot {
  constructor(readonly id: string) {
    super();
  }

  create() {
    this.apply(new ThingCreated(this.id));
    return this;
  }
}

class CreateThingCommand {}

function makeEventBus() {
  return { publishAll: vi.fn(), publish: vi.fn() } as never;
}

describe('CommandBaseHandler publication semantics', () => {
  it('publishes the aggregate events exactly once on success', async () => {
    const bus = makeEventBus();
    class Handler extends CommandBaseHandler<CreateThingCommand, Thing> {
      constructor() {
        super(bus);
      }
      async handle() {
        return new Thing('t-1').create();
      }
    }

    const result = await new Handler().execute(new CreateThingCommand());

    expect(result).toBeInstanceOf(Thing);
    expect(
      (bus as unknown as { publishAll: ReturnType<typeof vi.fn> }).publishAll,
    ).toHaveBeenCalledTimes(1);
    expect(result.getUncommittedEvents()).toHaveLength(0);
  });

  it('publishes from a result that carries the aggregate', async () => {
    const bus = makeEventBus();
    type Result = { aggregate: Thing; token: string };
    class Handler extends CommandBaseHandler<CreateThingCommand, Result> {
      constructor() {
        super(bus);
      }
      async handle() {
        return { aggregate: new Thing('t-2').create(), token: 'abc' };
      }
    }

    const result = await new Handler().execute(new CreateThingCommand());

    expect(result.token).toBe('abc');
    expect(
      (bus as unknown as { publishAll: ReturnType<typeof vi.fn> }).publishAll,
    ).toHaveBeenCalledTimes(1);
  });

  it('publishes nothing when the handler fails', async () => {
    const bus = makeEventBus();
    const failure = new Error('persistence failed');
    class Handler extends CommandBaseHandler<CreateThingCommand, Thing> {
      constructor() {
        super(bus);
      }
      async handle(): Promise<Thing> {
        new Thing('t-3').create();
        throw failure;
      }
    }

    await expect(new Handler().execute(new CreateThingCommand())).rejects.toBe(
      failure,
    );
    expect(
      (bus as unknown as { publishAll: ReturnType<typeof vi.fn> }).publishAll,
    ).not.toHaveBeenCalled();
  });

  it('publishes nothing when the aggregate raised no events', async () => {
    const bus = makeEventBus();
    class Handler extends CommandBaseHandler<CreateThingCommand, Thing> {
      constructor() {
        super(bus);
      }
      async handle() {
        return new Thing('t-4');
      }
    }

    await new Handler().execute(new CreateThingCommand());

    expect(
      (bus as unknown as { publishAll: ReturnType<typeof vi.fn> }).publishAll,
    ).not.toHaveBeenCalled();
  });

  it('rejects a handler whose result carries no aggregate', () => {
    const bus = makeEventBus();

    class Handler extends CommandBaseHandler<
      CreateThingCommand,
      // @ts-expect-error a DTO carries no aggregate, so events could never be published
      { archivedAt: Date }
    > {
      constructor() {
        super(bus);
      }
      async handle() {
        return { archivedAt: new Date() };
      }
    }

    expect(Handler).toBeTypeOf('function');
  });
});
