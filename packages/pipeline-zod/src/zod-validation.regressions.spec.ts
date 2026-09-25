/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  createCommand,
  getRawInput,
  getValidatedData,
  ZOD_SCHEMA_KEY,
  ZOD_VALIDATED_DATA_KEY,
  ZodValidationBehavior,
  ZodValidationError,
} from './index';

function run(
  request: object,
  requestType: unknown,
  next = vi.fn(async () => 'done'),
) {
  return new ZodValidationBehavior().handle(
    { request, requestType } as IPipelineContext,
    next,
  );
}

describe('validated request mutation tracking', () => {
  it('rejects Set mutations when structurally identical elements have unequal multiplicities', async () => {
    const Command = createCommand(
      z.object({
        entries: z
          .set(z.object({ n: z.number() }))
          .refine((entries) => [...entries].some(({ n }) => n === 2)),
      }),
    );
    const request = new Command({ entries: new Set([{ n: 1 }, { n: 2 }]) });
    ([...request.entries][1] as { n: number }).n = 1;
    const next = vi.fn();
    await expect(run(request, Command, next)).rejects.toBeInstanceOf(
      ZodValidationError,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('detects trailing array holes introduced by increasing length', async () => {
    const Command = createCommand(
      z.object({ entries: z.array(z.number()).max(1) }),
    );
    const request = new Command({ entries: [] });
    request.entries.length = 2;
    await expect(run(request, Command)).rejects.toBeInstanceOf(
      ZodValidationError,
    );
  });

  it('does not let a caller mutate the stored validation snapshot through the inspection helper', async () => {
    const Command = createCommand(
      z.object({ nested: z.object({ age: z.number().positive() }) }),
    );
    const request = new Command({ nested: { age: 1 } });
    request.nested.age = -1;
    const inspected = getValidatedData<{ nested: { age: number } }>(request)!;
    inspected.nested.age = -1;
    await expect(run(request, Command)).rejects.toBeInstanceOf(
      ZodValidationError,
    );
  });

  it('removes omitted parsed fields while preserving actual base-owned fields', async () => {
    class Base {
      marker = 'base';
    }
    const Command = createCommand(
      z
        .object({ include: z.boolean(), value: z.string().optional() })
        .transform(({ include, value }) =>
          include ? { include, value } : { include },
        ),
      Base,
    );
    const request = new Command({ include: true, value: 'remove-me' });
    request.include = false;
    await run(request, Command);
    expect(Object.hasOwn(request, 'value')).toBe(false);
    expect(request.marker).toBe('base');
  });

  it('does not rerun a transform whose result contains an own __proto__ key', async () => {
    const transform = vi.fn(() =>
      JSON.parse(
        '{"__proto__":{"tag":"data"},"nested":{"__proto__":{"value":1}}}',
      ),
    );
    const Command = createCommand(z.object({}).transform(transform));
    const request = new Command({});
    await run(request, Command);
    await run(request, Command);
    expect(transform).toHaveBeenCalledOnce();
    const snapshot = getValidatedData<Record<string, unknown>>(request)!;
    expect(Object.hasOwn(snapshot, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(request)).toBe(Command.prototype);
  });

  it('revalidates a request when its attached schema differs from the constructor schema', async () => {
    const Parent = createCommand(z.object({ age: z.number() }));
    class Child extends Parent {
      static readonly [ZOD_SCHEMA_KEY] = z.object({
        age: z.number().positive(),
      });
    }
    const request = new Child({ age: -1 });
    await expect(run(request, Child)).rejects.toBeInstanceOf(
      ZodValidationError,
    );
  });

  it('retains cyclic values accepted by a custom schema and detects their mutations', async () => {
    type Graph = { count: number; self?: Graph };
    const schema = z.object({
      graph: z.custom<Graph>(
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          (value as Graph).count > 0,
      ),
    });
    const Command = createCommand(schema);
    const graph: Graph = { count: 1 };
    graph.self = graph;
    const request = new Command({ graph });
    await expect(run(request, Command)).resolves.toBe('done');
    request.graph.count = -1;
    await expect(run(request, Command)).rejects.toBeInstanceOf(
      ZodValidationError,
    );
  });

  it('recognizes unchanged binary transform output without parsing output as input', async () => {
    const Command = createCommand(
      z.object({
        bytes: z.string().transform((value) => new TextEncoder().encode(value)),
      }),
    );
    const request = new Command({ bytes: 'hello' });
    await expect(run(request, Command)).resolves.toBe('done');
  });

  it('keeps subclass fields and does not reparse when a field outside the schema changes', async () => {
    const transform = vi.fn((value: string) => value.length);
    const Command = createCommand(
      z.object({ label: z.string().transform(transform) }),
    );
    class Tagged extends Command {
      tag = 'initial';
    }
    const request = new Tagged({ label: 'abcd' });
    expect(request.label).toBe(4);
    request.tag = 'changed';

    await expect(run(request, Tagged)).resolves.toBe('done');
    expect(transform).toHaveBeenCalledOnce();
    expect(request.tag).toBe('changed');
    expect(request.label).toBe(4);
  });

  it('strips keys the schema omits from a request it has not validated before', async () => {
    class Event {
      static readonly [ZOD_SCHEMA_KEY] = z.object({ kept: z.string() });
      kept = 'value';
      injected = 'unknown';
    }
    const request = new Event();
    await expect(run(request, Event)).resolves.toBe('done');
    expect(Object.hasOwn(request, 'injected')).toBe(false);
    expect(request.kept).toBe('value');
  });
});

describe('requests without an introspectable schema', () => {
  it('passes through a request whose type cannot carry a schema', async () => {
    const request = Object.create(null) as { payload: string };
    request.payload = 'raw';
    await expect(
      run(request, (request as { constructor?: unknown }).constructor),
    ).resolves.toBe('done');
  });
});

describe('raw input inspection', () => {
  it.each([null, undefined])(
    'preserves raw %s input accepted by preprocessing',
    (input) => {
      const Command = createCommand(
        z.preprocess(
          () => ({ name: 'default' }),
          z.object({ name: z.string() }),
        ),
      );
      expect(getRawInput(new Command(input))).toBe(input);
    },
  );
});

it('reads ZOD_VALIDATED_DATA_KEY metadata without trusting it to skip validation', async () => {
  class Request {
    static readonly [ZOD_SCHEMA_KEY] = z.object({ age: z.number().positive() });
    age = -1;
  }
  const request = Object.assign(new Request(), {
    [ZOD_VALIDATED_DATA_KEY]: { age: -1 },
  });
  expect(getValidatedData(request)).toEqual({ age: -1 });
  await expect(run(request, Request)).rejects.toBeInstanceOf(
    ZodValidationError,
  );
});

it('does not reparse ordinary class-valued transform output', async () => {
  class Value {
    constructor(readonly value: string) {}
  }
  const Command = createCommand(
    z.object({ value: z.string().transform((value) => new Value(value)) }),
  );
  const request = new Command({ value: 'preserved' });
  await expect(run(request, Command)).resolves.toBe('done');
  expect(request.value).toBeInstanceOf(Value);
});

it('revalidates opaque built-in values whose state is not enumerable', async () => {
  const Command = createCommand(
    z.object({
      url: z.instanceof(URL).refine((value) => value.protocol === 'https:'),
    }),
  );
  const request = new Command({ url: new URL('https://example.test') });
  request.url.protocol = 'http:';
  await expect(run(request, Command)).rejects.toBeInstanceOf(
    ZodValidationError,
  );
});
