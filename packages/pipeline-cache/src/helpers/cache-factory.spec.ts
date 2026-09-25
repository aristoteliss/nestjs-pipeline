/* Copyright (C) 2026-present Aristotelis — see repository license. */

import Module from 'node:module';
import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { describe, expect, it } from 'vitest';
import { buildCache, buildKeyv } from './cache-factory';

describe('cache-factory', () => {
  describe('buildKeyv', () => {
    it('creates in-memory Keyv store with namespace and ttl', () => {
      const keyv = buildKeyv({
        type: 'memory',
        namespace: 'test-ns',
        ttl: 5000,
      });
      expect(keyv).toBeInstanceOf(Keyv);
      expect(keyv.throwOnErrors).toBe(true);
    });

    it('creates adapter Keyv stores when configured', () => {
      const redisKeyv = buildKeyv({
        type: 'redis',
        url: 'redis://localhost:6379',
      });
      expect(redisKeyv).toBeInstanceOf(Keyv);

      const memcacheKeyv = buildKeyv({
        type: 'memcache',
        url: 'memcache://localhost:11211',
      });
      expect(memcacheKeyv).toBeInstanceOf(Keyv);

      const postgresKeyv = buildKeyv({
        type: 'postgres',
        url: 'postgresql://localhost:5432/db',
      });
      expect(postgresKeyv).toBeInstanceOf(Keyv);
    });

    describe('adapter load diagnostics', () => {
      /**
       * Each failure keeps its own diagnosis. Telling someone to install a
       * package they already have sends them in the wrong direction; the three
       * causes — unresolvable, present-but-unbuilt, and broken-for-another-reason
       * — need different actions.
       *
       * The cases are injected rather than inferred from whichever optional
       * adapters happen to be installed in the developer's workspace, which is
       * what made the previous test assert the wrong diagnosis on a machine where
       * `@keyv/sqlite` resolved but its native binding did not.
       */
      function loadWith(failure: unknown): () => unknown {
        const NodeModule = Module as unknown as {
          _resolveFilename: unknown;
          _load: unknown;
        };
        const resolve = NodeModule._resolveFilename;
        const load = NodeModule._load;
        NodeModule._load = ((request: string, ...rest: unknown[]) => {
          if (request === '@keyv/sqlite') throw failure;
          return (load as never as (...a: unknown[]) => unknown)(
            request,
            ...rest,
          );
        }) as never;
        return () => {
          NodeModule._load = load;
          NodeModule._resolveFilename = resolve;
        };
      }

      it('tells the user to install an adapter that cannot be resolved', () => {
        const notFound = Object.assign(
          new Error("Cannot find module '@keyv/sqlite'"),
          { code: 'MODULE_NOT_FOUND' },
        );
        const restore = loadWith(notFound);

        try {
          expect(() =>
            buildKeyv({ type: 'sqlite', url: 'sqlite://cache.sqlite' }),
          ).toThrowError(/The optional '@keyv\/sqlite' package is required/);
        } finally {
          restore();
        }
      });

      it('tells the user to rebuild an adapter whose native binding failed', () => {
        const restore = loadWith(
          new Error('Could not locate the bindings file. Tried: ...'),
        );

        try {
          expect(() =>
            buildKeyv({ type: 'sqlite', url: 'sqlite://cache.sqlite' }),
          ).toThrowError(
            /installed but its native binding could not be loaded/,
          );
        } finally {
          restore();
        }
      });

      it('rethrows any other load failure untouched', () => {
        // A missing transitive dependency, a broken export, an initialization
        // error: the adapter's own message is the accurate one.
        const transitive = Object.assign(
          new Error("Cannot find module 'some-transitive-dep'"),
          { code: 'MODULE_NOT_FOUND' },
        );
        const restore = loadWith(transitive);

        try {
          expect(() =>
            buildKeyv({ type: 'sqlite', url: 'sqlite://cache.sqlite' }),
          ).toThrowError(transitive);
        } finally {
          restore();
        }
      });

      it('rethrows a thrown non-Error value untouched', () => {
        const failure = 'adapter initialization aborted';
        const restore = loadWith(failure);

        try {
          let thrown: unknown;
          try {
            buildKeyv({ type: 'sqlite', url: 'sqlite://cache.sqlite' });
          } catch (error) {
            thrown = error;
          }
          expect(thrown).toBe(failure);
        } finally {
          restore();
        }
      });

      it('preserves the original failure as the cause', () => {
        const notFound = Object.assign(
          new Error("Cannot find module '@keyv/sqlite'"),
          { code: 'MODULE_NOT_FOUND' },
        );
        const restore = loadWith(notFound);

        try {
          let thrown: unknown;
          try {
            buildKeyv({ type: 'sqlite', url: 'sqlite://cache.sqlite' });
          } catch (error) {
            thrown = error;
          }
          expect((thrown as { cause?: unknown }).cause).toBe(notFound);
        } finally {
          restore();
        }
      });
    });
  });

  describe('adapter module shapes', () => {
    it('constructs an adapter whose module exports the constructor itself', () => {
      class DirectExportAdapter extends Map {
        constructor(
          readonly url: unknown,
          readonly options: unknown,
        ) {
          super();
        }
      }
      const NodeModule = Module as unknown as { _load: unknown };
      const load = NodeModule._load;
      NodeModule._load = ((request: string, ...rest: unknown[]) => {
        if (request === '@keyv/sqlite') return DirectExportAdapter;
        return (load as never as (...a: unknown[]) => unknown)(
          request,
          ...rest,
        );
      }) as never;

      try {
        const keyv = buildKeyv({
          type: 'sqlite',
          url: 'sqlite://cache.sqlite',
          options: { table: 'entries' },
        });

        expect(keyv.store).toBeInstanceOf(DirectExportAdapter);
        expect(keyv.store.url).toBe('sqlite://cache.sqlite');
        expect(keyv.store.options).toEqual({ table: 'entries' });
      } finally {
        NodeModule._load = load;
      }
    });
  });

  describe('buildCache', () => {
    it('returns custom pre-built cache when provided', () => {
      const preBuilt = createCache({ stores: [new Keyv()] });
      const cache = buildCache({ cache: preBuilt });
      expect(cache).toBe(preBuilt);
    });

    it('does not mutate stores owned by a pre-built cache', () => {
      const customKeyv = new Keyv({ throwOnErrors: false });
      const preBuilt = createCache({ stores: [customKeyv] });

      const cache = buildCache({ cache: preBuilt });

      expect(cache).toBe(preBuilt);
      expect(customKeyv.throwOnErrors).toBe(false);
    });

    it('builds cache with custom pre-built Keyv stores without changing their error policy', () => {
      const customKeyv = new Keyv({
        namespace: 'custom',
        throwOnErrors: false,
      });

      const cache = buildCache({ stores: [customKeyv] });

      expect(cache).toBeDefined();
      expect(customKeyv.throwOnErrors).toBe(false);
    });

    it('builds cache with declarative memory store config', () => {
      const cache = buildCache({
        store: { type: 'memory', namespace: 'app' },
        ttl: 10000,
      });
      expect(cache).toBeDefined();
      expect(cache.stores[0]?.throwOnErrors).toBe(true);
    });

    it('builds default in-memory cache when options are empty', () => {
      const cache = buildCache({});
      expect(cache).toBeDefined();
      expect(cache.stores[0]?.throwOnErrors).toBe(true);
    });
  });
});
