/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
let directory: string;

function lintFixture(relativePath: string, source: string) {
  const target = resolve(directory, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  const result = spawnSync(
    resolve(root, 'node_modules/.bin/biome'),
    ['lint', `--config-path=${directory}`, target],
    { encoding: 'utf8', cwd: directory },
  );
  if (result.error) throw result.error;
  return { status: result.status, diagnostics: result.stdout + result.stderr };
}

beforeAll(() => {
  directory = mkdtempSync(resolve(tmpdir(), 'biome-general-plugins-'));
  const configuration = JSON.parse(
    readFileSync(resolve(root, 'biome.json'), 'utf8'),
  );
  configuration.plugins = configuration.plugins.map(
    (plugin: { path: string; includes: string[] }) => ({
      ...plugin,
      path: resolve(root, plugin.path),
    }),
  );
  configuration.linter.rules = { recommended: false };
  configuration.overrides = [];
  writeFileSync(
    resolve(directory, 'biome.json'),
    JSON.stringify(configuration),
  );
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('Biome Grit test-suite plugin', () => {
  it('accepts standard test structures without focused executions', () => {
    const source = `
      import { describe, it, expect } from 'vitest';
      describe('my-suite', () => {
        it('passes', () => {
          expect(1).toBe(1);
        });
      });
    `;
    expect(
      lintFixture('packages/test-pkg/sample.spec.ts', source),
    ).toMatchObject({
      status: 0,
    });
  });

  it.each(['describe.only', 'it.only', 'test.only', 'fit', 'fdescribe'])(
    'rejects focused execution %s in test files',
    (token) => {
      const source = `
        import { describe, it, test } from 'vitest';
        ${token}('should fail', () => {});
      `;
      const result = lintFixture(
        'packages/test-pkg/sample-focused.spec.ts',
        source,
      );
      expect(result.status).toBe(1);
      expect(result.diagnostics).toContain('Do not commit focused tests');
    },
  );
});

describe('Biome Grit verify-package-licenses plugin', () => {
  it('accepts standalone package imports', () => {
    const source = `
      import { Injectable } from '@nestjs/common';
      import { IPipelineBehavior } from '@nestjs-pipeline/core';
      export class MyBehavior implements IPipelineBehavior {}
    `;
    expect(lintFixture('packages/my-lib/src/index.ts', source)).toMatchObject({
      status: 0,
    });
  });

  it.each([
    'packages/my-lib/src/coupled.ts',
    'packages/pipeline-tenant/src/coupled.ts',
  ])('rejects a pipeline package importing @cqrs-ddd/core (%s)', (path) => {
    const source = `
      import { DomainException } from '@cqrs-ddd/core/domain';
    `;
    const result = lintFixture(path, source);
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'preserve standalone package license boundaries',
    );
  });

  it('allows a pipeline package to import the framework-neutral utilities', () => {
    const source = `
      import { stableStringify } from '@cqrs-ddd/safe-stringify';
      import { uuidv7 } from '@cqrs-ddd/uuidv7';
      export const key = () => stableStringify({ id: uuidv7() });
    `;
    expect(
      lintFixture('packages/my-lib/src/uses-utils.ts', source).status,
    ).toBe(0);
  });

  it('rejects standalone package imports leaking into the api application', () => {
    const source = `
      import { User } from '../../api/src/users/domain/models/user.entity';
    `;
    const result = lintFixture('packages/my-lib/src/leaking.ts', source);
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'preserve standalone package license boundaries',
    );
  });
});

describe('Biome Grit package-licenses plugin', () => {
  it('accepts public NestJS framework imports', () => {
    const source = `
      import { Injectable, Module } from '@nestjs/common';
      import { CqrsModule } from '@nestjs/cqrs';
    `;
    expect(
      lintFixture('packages/my-lib/src/framework.ts', source),
    ).toMatchObject({
      status: 0,
    });
  });

  it('rejects private NestJS framework internal imports in packages', () => {
    const source = `
      import { RouterExecutionContext } from '@nestjs/core/router/router-execution-context';
    `;
    const result = lintFixture(
      'packages/my-lib/src/private-framework.ts',
      source,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Do not import private NestJS framework internals',
    );
  });
});

describe('Biome Grit transport-neutral-errors plugin', () => {
  it('accepts framework-neutral errors in a behavior package', () => {
    const source = `
      import { Injectable } from '@nestjs/common';
      import { UnauthorizedActionException } from './errors';
      @Injectable()
      export class MyBehavior {
        deny() { throw new UnauthorizedActionException({ action: 'read' }); }
      }
    `;
    expect(
      lintFixture('packages/my-lib/src/my.behavior.ts', source),
    ).toMatchObject({
      status: 0,
    });
  });

  it('rejects importing a Nest HTTP exception into a behavior package', () => {
    const source = `
      import { ForbiddenException, Injectable } from '@nestjs/common';
      @Injectable()
      export class MyBehavior {}
    `;
    const result = lintFixture(
      'packages/my-lib/src/importing.behavior.ts',
      source,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Do not import NestJS HTTP exceptions into domain, application or pipeline-behavior code',
    );
  });

  it('rejects an aliased Nest HTTP exception import, not only the shorthand form', () => {
    const source = `
      import { NotFoundException as Missing } from '@nestjs/common';
      export const raise = () => { throw new Missing('gone'); };
    `;
    expect(
      lintFixture('packages/my-lib/src/aliased.behavior.ts', source).status,
    ).toBe(1);
  });

  it('rejects constructing a Nest HTTP exception in ddd-core', () => {
    const source = `
      export function guard() { throw new ConflictException('duplicate'); }
    `;
    const result = lintFixture('packages/ddd-core/domain/guard.ts', source);
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Do not construct NestJS HTTP exceptions',
    );
  });

  it('allows HTTP exceptions in presentation adapters, whose job is transport mapping', () => {
    const source = `
      import { BadRequestException } from '@nestjs/common';
      export class MyPipe {
        transform() { throw new BadRequestException('bad'); }
      }
    `;
    expect(
      lintFixture('packages/my-lib/src/pipes/my.pipe.ts', source),
    ).toMatchObject({ status: 0 });
  });
});

describe('Biome Grit handler-boundaries plugin', () => {
  it('accepts repository interfaces injected through tokens', () => {
    const source = `
      import { Inject } from '@nestjs/common';
      import { ICommandRepository } from '@cqrs-ddd/core/application';
      export class CreateUserHandler {
        constructor(@Inject('REPO') private readonly repo: ICommandRepository) {}
      }
    `;
    expect(
      lintFixture('api/src/users/cqrs/commands/create.handler.ts', source),
    ).toMatchObject({ status: 0 });
  });

  it('rejects an ORM import inside a CQRS handler', () => {
    const source = `
      import { EntityManager } from '@mikro-orm/core';
      export class LeakyHandler { constructor(private readonly em: EntityManager) {} }
    `;
    const result = lintFixture(
      'api/src/users/cqrs/commands/leaky.handler.ts',
      source,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'CQRS handlers and application services must not import the ORM',
    );
  });

  it('rejects a concrete persistence store token inside a CQRS handler', () => {
    const source = `
      import { MIKRO_ORM_CLIENT } from '../../../persistence/mikro-orm.store';
      export const token = MIKRO_ORM_CLIENT;
    `;
    expect(
      lintFixture('api/src/users/cqrs/queries/leaky.handler.ts', source).status,
    ).toBe(1);
  });

  it('allows the same ORM import inside a persistence adapter', () => {
    const source = `
      import { EntityManager } from '@mikro-orm/core';
      export class UserRepository { constructor(private readonly em: EntityManager) {} }
    `;
    expect(
      lintFixture('api/src/users/persistence/user.repository.ts', source),
    ).toMatchObject({ status: 0 });
  });
});

describe('Biome Grit core-environment plugin', () => {
  it('rejects a process.env read in ddd-core', () => {
    const source = `
      export const SCHEMA = process.env.DB_DEFAULT_SCHEMA || 'tenant';
    `;
    const result = lintFixture(
      'packages/ddd-core/persistence/helpers/key.helper.ts',
      source,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Do not read process.env in shared library or DDD core code',
    );
  });

  it('rejects a process.env read in a published package', () => {
    expect(
      lintFixture(
        'packages/my-lib/src/config.ts',
        `export const url = process.env.REDIS_URL;`,
      ).status,
    ).toBe(1);
  });

  it('ignores process.env appearing only in a JSDoc example', () => {
    const source = `
      /**
       * @example
       * \`\`\`ts
       * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
       * \`\`\`
       */
      export const helper = () => 1;
    `;
    expect(
      lintFixture('packages/my-lib/src/documented.ts', source),
    ).toMatchObject({ status: 0 });
  });
});

describe('Biome Grit framework-independence plugin', () => {
  it.each([
    `import { Injectable } from '@nestjs/common';`,
    `import type { IPipelineContext } from '@nestjs-pipeline/core';`,
    `import * as cqrs from '@nestjs/cqrs';`,
    `import '@nestjs/core';`,
    `export { pipelineStore } from '@nestjs-pipeline/core';`,
    `export * from '@nestjs-pipeline/correlation';`,
    `import cls = require('nestjs-cls');`,
    `declare module '@nestjs/common' {}`,
    `export const load = () => import('@nestjs/common');`,
    `const { EventBus } = require('@nestjs/cqrs');`,
  ])('rejects %s in ddd-core', (source) => {
    const result = lintFixture(
      'packages/ddd-core/application/coupled.ts',
      source,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain('This package is framework-neutral');
  });

  it.each([
    'packages/ddd-core/application/coupled.spec.ts',
    'packages/uuidv7/src/index.ts',
    'packages/safe-stringify/src/index.ts',
  ])('covers %s', (path) => {
    expect(
      lintFixture(path, `import { Injectable } from '@nestjs/common';`).status,
    ).toBe(1);
  });

  it('accepts built-ins, MikroORM, relative paths, and NestJS names in strings or comments', () => {
    const source = `
      import { AsyncLocalStorage } from 'node:async_hooks';
      import { Type } from '@mikro-orm/core';
      import { helper } from './nestjs/helper';
      // A NestJS handler passes the EventBus injected from '@nestjs/cqrs'.
      export const fixture = \`import { Injectable } from '@nestjs/common';\`;
      export const moduleName = '@nestjs/common';
      export const load = () => import('./local');
    `;
    expect(
      lintFixture('packages/ddd-core/persistence/neutral.ts', source),
    ).toMatchObject({ status: 0 });
  });

  it('leaves NestJS imports to the application and the pipeline packages', () => {
    const source = `import { Injectable } from '@nestjs/common';`;
    expect(lintFixture('api/src/users/users.module.ts', source).status).toBe(0);
    expect(
      lintFixture('packages/my-lib/src/my.behavior.ts', source).status,
    ).toBe(0);
  });
});

describe('Biome Grit event-handler-substance plugin', () => {
  it('reports a log-only event handler, at warn so a showcase does not fail the build', () => {
    const source = `
      import { EventsHandler } from '@nestjs/cqrs';
      import { getCorrelationId } from '@nestjs-pipeline/correlation';
      @EventsHandler(UserDeletedEvent)
      export class UserDeletedHandler {
        private readonly logger = new Logger('x');
        async handle(event: UserDeletedEvent): Promise<void> {
          this.logger.log(\`deleted \${getCorrelationId()}\`);
        }
      }
    `;
    const result = lintFixture(
      'api/src/users/cqrs/events/log-only.handler.ts',
      source,
    );
    expect(result.diagnostics).toContain('only produces observability output');
    expect(result.status).toBe(0);
  });

  it('accepts an event handler that awaits real work', () => {
    const source = `
      import { EventsHandler } from '@nestjs/cqrs';
      @EventsHandler(UserCreatedEvent)
      export class UserCreatedHandler {
        private readonly logger = new Logger('x');
        async handle(event: UserCreatedEvent): Promise<void> {
          this.logger.log('dispatching');
          await this.dispatcher.enqueueWelcomeEmail(event.payload);
        }
      }
    `;
    const result = lintFixture(
      'api/src/users/cqrs/events/real-work.handler.ts',
      source,
    );
    expect(result.diagnostics).not.toContain(
      'only produces observability output',
    );
  });
});

describe('Biome Grit ddd entry-point boundaries', () => {
  it.each([
    'domain/models',
    'cqrs/commands',
    'application',
    'persistence',
    'services',
  ])('rejects the root barrel in production %s code', (layer) => {
    const result = lintFixture(
      `api/src/users/${layer}/root.ts`,
      `import { RootEntity } from '@cqrs-ddd/core';`,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain('Do not use the ddd-core root barrel');
  });

  it.each([
    ['domain/models', 'domain', 'RootEntity'],
    ['cqrs/commands', 'application', 'ICommandRepository'],
    ['persistence', 'persistence', 'QueryRepository'],
  ])('accepts %s dependencies from /%s', (layer, entry, symbol) => {
    expect(
      lintFixture(
        `api/src/users/${layer}/allowed.ts`,
        `import { ${symbol} } from '@cqrs-ddd/core/${entry}';`,
      ).status,
    ).toBe(0);
  });

  it.each(['domain/models', 'cqrs/queries', 'application'])(
    'rejects persistence dependencies in %s',
    (layer) => {
      const result = lintFixture(
        `api/src/users/${layer}/leak.ts`,
        `import { QueryRepository } from '@cqrs-ddd/core/persistence';`,
      );
      expect(result.status).toBe(1);
      expect(result.diagnostics).toContain(
        'must not import @cqrs-ddd/core/persistence',
      );
    },
  );
});

describe('Biome Grit aggregate-identity setter guard plugin', () => {
  it.each([
    "role['name'] = 'Admin';",
    'role["name"] = "Admin";',
    "role.name += '!';",
    'user.version += 1;',
    'user.version -= 1;',
    'user.version *= 2;',
    'user.version /= 2;',
    'user.version %= 2;',
    'user.version **= 2;',
    'user.version <<= 1;',
    'user.version >>= 1;',
    'user.version >>>= 1;',
    'user.version &= 1;',
    'user.version |= 1;',
    'user.version ^= 1;',
    "role.name ||= 'Admin';",
    "role.name &&= 'Admin';",
    "role.name ??= 'Admin';",
    'user.version++;',
    '--user.version;',
    "entity['version']++;",
    "++aggregate['version'];",
  ])('rejects aggregate mutation syntax: %s', (code) => {
    const result = lintFixture(
      'api/src/users/application/mutation.ts',
      `export function mutate(user: any, role: any, entity: any, aggregate: any) { ${code} }`,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Do not assign aggregate properties directly via setters',
    );
  });

  it.each([
    "dto.name = 'display';",
    "dto['name'] += '!';",
    'snapshot.version++;',
    "response.username = 'alice';",
    "command.department = 'Engineering';",
    "user.displayName = 'Alice';",
    "role.description = 'Manager';",
    "this.name = 'CustomError';",
  ])('allows unrelated writes: %s', (code) => {
    expect(
      lintFixture(
        'api/src/users/application/dto-mapping.ts',
        `export function map(dto: any, snapshot: any, response: any, command: any, user: any, role: any) { ${code} }`,
      ).status,
    ).toBe(0);
  });

  // These cases document the syntax-only boundary rather than type enforcement.
  it.each([
    "const loaded = role; loaded.name = 'Admin';",
    "const key = 'name'; role[key] = 'Admin';",
    "Object.assign(role, { name: 'Admin' });",
  ])('does not resolve aliases, computed keys or reflection: %s', (code) => {
    expect(
      lintFixture(
        'api/src/users/application/limitations.ts',
        `export function mutate(role: any) { ${code} }`,
      ).status,
    ).toBe(0);
  });

  it.each([
    ['id', "user.id = '018f2d5a-6b8c-7e3f-9a1b-2c3d4e5f6a7b';"],
    ['createdAt', 'user.createdAt = new Date();'],
    ['updatedAt', 'user.updatedAt = new Date();'],
    ['version', 'user.version = 2;'],
    ['username', "user.username = 'new-username';"],
    ['department', "user.department = 'Engineering';"],
    ['name', "role.name = 'Admin';"],
  ])('rejects direct mutation of %s in cqrs handlers', (_property, code) => {
    const result = lintFixture(
      'api/src/users/cqrs/commands/update-user.handler.ts',
      `export function mutate(user: any, role: any) { ${code} }`,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Do not assign aggregate properties directly via setters',
    );
  });

  it('accepts domain method calls and factories in cqrs handlers', () => {
    const result = lintFixture(
      'api/src/users/cqrs/commands/update-user.handler.ts',
      `
      export function execute(user: any) {
        user.rename('new-username');
        user.changeDepartment('Engineering');
      }
      `,
    );
    expect(result.status).toBe(0);
  });

  it('permits this.name assignment in error constructors', () => {
    const result = lintFixture(
      'api/src/users/cqrs/commands/errors/custom.exception.ts',
      `
      export class CustomException extends Error {
        constructor() {
          super('error');
          this.name = 'CustomException';
        }
      }
      `,
    );
    expect(result.status).toBe(0);
  });

  it('permits setter hydration inside persistence adapters', () => {
    const result = lintFixture(
      'api/src/users/persistence/user.hydrator.ts',
      `
      export function hydrate(user: any) {
        user.id = '018f2d5a-6b8c-7e3f-9a1b-2c3d4e5f6a7b';
        user.username = 'alice';
      }
      `,
    );
    expect(result.status).toBe(0);
  });
});

describe('Biome Grit domain-mutation plugin', () => {
  it('rejects @ApplyMutation() without event configuration', () => {
    const result = lintFixture(
      'api/src/users/domain/models/sample.entity.ts',
      `
      export class Sample {
        @ApplyMutation()
        update() { this.applyPatch({ username: 'bob' }); return this; }
      }
      `,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      '@ApplyMutation() requires the domain event it records',
    );
  });

  it('accepts canonical @ApplyMutation with event configuration', () => {
    const result = lintFixture(
      'api/src/users/domain/models/sample.entity.ts',
      `
      export class Sample {
        @ApplyMutation({ event: (s) => new Event(s) })
        update() { this.applyPatch({ username: 'bob' }); return this; }
      }
      `,
    );
    expect(result.status).toBe(0);
  });

  it('rejects this.apply() inside domain methods', () => {
    const result = lintFixture(
      'api/src/users/domain/models/sample.entity.ts',
      `
      export class Sample {
        update() {
          this.apply(new Event());
        }
      }
      `,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'Domain events belong in @ApplyMutation({ event })',
    );
  });

  it('rejects direct field assignment inside @ApplyMutation methods', () => {
    const result = lintFixture(
      'api/src/users/domain/models/sample.entity.ts',
      `
      export class Sample {
        @ApplyMutation({ event: (s) => new Event(s) })
        update() {
          this._username = 'bob';
        }
      }
      `,
    );
    expect(result.status).toBe(1);
    expect(result.diagnostics).toContain(
      'An @ApplyMutation() method uses this.applyPatch() instead of assigning backing fields',
    );
  });
});
