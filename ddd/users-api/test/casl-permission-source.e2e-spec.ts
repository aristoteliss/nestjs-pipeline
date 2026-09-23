/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import { QueryBus } from '@nestjs/cqrs';
import {
  CASL_PERMISSION_SOURCE,
  UnauthorizedActionException,
} from '@nestjs-pipeline/casl';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  bootstrapE2E,
  type E2EContext,
  rebuildPermissions,
} from './support/e2e-app';

const TENANT = 'tenant';
const ALICE_ADMIN = '019de10c-b680-7000-8000-000000000006';
const ADMIN_ROLE = '019de10c-b680-7000-8000-000000000001';
const USER_READ_CAPABILITY = '019de10c-b680-7000-8000-00000000000f';
const ADMIN = JSON.stringify({ id: 'seed', grants: ['all|manage|*'] });

/**
 * Boots the real AppModule and dispatches a gated query through the real
 * QueryBus, so `CaslModule`, `AuthorizationModule` and `PersistenceModule`
 * resolve together and the permission source reads seeded rows.
 */
describe('CASL permission source wiring (e2e)', () => {
  let ctx: E2EContext;
  let unassignedUserId: string;

  const http = () => request(ctx.app.getHttpServer() as Server);

  async function createUser(name: string): Promise<string> {
    const created = await http()
      .post('/users')
      .set('x-tenant-schema', TENANT)
      .set('x-test-user', ADMIN)
      .send({ email: `${name}-${Date.now()}@acme.test`, name });
    expect(created.status).toBe(201);
    return created.body.id;
  }

  async function sql(statement: string, params: unknown[]): Promise<void> {
    const { MIKRO_ORM_CLIENT } = await import('@persistence/mikro-orm.store');
    await ctx.app.get(MIKRO_ORM_CLIENT).em.execute(statement, params);
  }

  const assign = (userId: string, roleId: string) =>
    sql('insert into user_roles (user_id, role_id) values (?, ?)', [
      userId,
      roleId,
    ]);

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    unassignedUserId = await createUser('unassigned');
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function readAs(principalId: string): Promise<unknown> {
    const { sessionUserStore } = await import(
      '../src/common/context/session-user.store'
    );
    const { TenantSchemaContext } = await import(
      '../src/persistence/tenant-schema.context'
    );
    const { GetUserQuery } = await import(
      '../src/users/cqrs/queries/get-user.query'
    );
    return ctx.app
      .get(TenantSchemaContext)
      .run(TENANT, () =>
        sessionUserStore.run(
          { id: principalId, principalType: 'user', tenant: TENANT },
          () =>
            ctx.app
              .get(QueryBus)
              .execute(new GetUserQuery({ userId: ALICE_ADMIN })),
        ),
      );
  }

  it('authorizes from materialized rules without per-request assignment or role queries', async () => {
    const { GetUserCapabilitiesQueryRepository } = await import(
      '../src/auths/persistence/get-user-capabilities.query-repository'
    );
    const { GetRolesCapabilitiesQueryRepository } = await import(
      './support/roles-capabilities/get-roles-capabilities.query-repository'
    );
    const assignments = vi.spyOn(
      GetUserCapabilitiesQueryRepository.prototype,
      'find',
    );
    const roleFind = vi.spyOn(
      GetRolesCapabilitiesQueryRepository.prototype,
      'find',
    );
    const roleGet = vi.spyOn(
      GetRolesCapabilitiesQueryRepository.prototype,
      'getRoles',
    );

    await expect(readAs(ALICE_ADMIN)).resolves.toMatchObject({
      id: ALICE_ADMIN,
      username: 'alice_tenant',
    });
    expect(assignments).not.toHaveBeenCalled();
    expect(roleFind).not.toHaveBeenCalled();
    expect(roleGet).not.toHaveBeenCalled();

    assignments.mockRestore();
    roleFind.mockRestore();
    roleGet.mockRestore();
  });

  it('denies the next dispatch after a rebuild removes the rule, without a new login', async () => {
    const holder = await createUser('rebuild-holder');
    await assign(holder, ADMIN_ROLE);
    await rebuildPermissions(ctx.app, [holder]);
    await expect(readAs(holder)).resolves.toMatchObject({ id: ALICE_ADMIN });

    await sql('delete from user_roles where user_id = ?', [holder]);
    await rebuildPermissions(ctx.app, [holder]);

    await expect(readAs(holder)).rejects.toBeInstanceOf(
      UnauthorizedActionException,
    );
  });

  it('drops a deleted role from its holder on the next dispatch', async () => {
    const holder = await createUser('role-holder');
    const role = await http()
      .post('/roles')
      .set('x-tenant-schema', TENANT)
      .set('x-test-user', ADMIN)
      .send({ name: `readers-${Date.now()}` });
    expect(role.status).toBe(201);
    await sql(
      'insert into role_capabilities (role_id, capability_id) values (?, ?)',
      [role.body.id, USER_READ_CAPABILITY],
    );
    await assign(holder, role.body.id);
    await rebuildPermissions(ctx.app, [holder]);
    await expect(readAs(holder)).resolves.toMatchObject({ id: ALICE_ADMIN });

    const deleted = await http()
      .delete(`/roles/${role.body.id}`)
      .set('x-tenant-schema', TENANT)
      .set('x-test-user', ADMIN);
    expect(deleted.status).toBe(204);

    await expect(readAs(holder)).rejects.toBeInstanceOf(
      UnauthorizedActionException,
    );
  });

  it('denies a persisted principal without any assignment', async () => {
    await expect(readAs(unassignedUserId)).rejects.toBeInstanceOf(
      UnauthorizedActionException,
    );
  });

  it('binds the application source to the package token', async () => {
    const { CaslPermissionSource } = await import(
      '../src/auths/persistence/casl-permission.source'
    );
    const { ContextIdFactory } = await import('@nestjs/core');

    const source = await ctx.app.resolve(
      CASL_PERMISSION_SOURCE,
      ContextIdFactory.create(),
      { strict: false },
    );

    expect(source).toBeInstanceOf(CaslPermissionSource);
  });
});
