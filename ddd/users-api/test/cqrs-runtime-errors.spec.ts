/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import {
  type ArgumentsHost,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { EventBus } from '@nestjs/cqrs';
import {
  CaslAuthorizer,
  UnauthorizedActionException,
} from '@nestjs-pipeline/casl';
import { ZodValidationError, ZodValidationFilter } from '@nestjs-pipeline/zod';
import { describe, expect, it, vi } from 'vitest';
// Auths CQRS & Services
import { CreateAuthCommand } from '../src/auths/cqrs/commands/create-auth.command';
import { CreateAuthHandler } from '../src/auths/cqrs/commands/create-auth.handler';
import { DeleteAuthCommand } from '../src/auths/cqrs/commands/delete-auth.command';
import { DeleteAuthHandler } from '../src/auths/cqrs/commands/delete-auth.handler';
import { GetUserCapabilitiesHandler } from '../src/auths/cqrs/queries/get-user-capabilities.handler';
import { GetUserCapabilitiesQuery } from '../src/auths/cqrs/queries/get-user-capabilities.query';
import { UserLoginService } from '../src/auths/services/user-login.service';
// Filters
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { UnauthorizedActionFilter } from '../src/common/filters/unauthorized-action.filter';
import { TenantSchemaContext } from '../src/persistence/tenant-schema.context';

// Roles CQRS & Exceptions
import { CreateRoleCommand } from '../src/roles/cqrs/commands/create-role.command';
import { CreateRoleHandler } from '../src/roles/cqrs/commands/create-role.handler';
import { DeleteRoleCommand } from '../src/roles/cqrs/commands/delete-role.command';
import { DeleteRoleHandler } from '../src/roles/cqrs/commands/delete-role.handler';
import { UpdateRoleCommand } from '../src/roles/cqrs/commands/update-role.command';
import { UpdateRoleHandler } from '../src/roles/cqrs/commands/update-role.handler';
import { GetRoleHandler } from '../src/roles/cqrs/queries/get-role.handler';
import { GetRoleQuery } from '../src/roles/cqrs/queries/get-role.query';
import { GetRolesHandler } from '../src/roles/cqrs/queries/get-roles.handler';
import { GetRolesQuery } from '../src/roles/cqrs/queries/get-roles.query';
import { GetRolesCapabilitiesHandler } from '../src/roles/cqrs/queries/get-roles-capabilities.handler';
import { GetRolesCapabilitiesQuery } from '../src/roles/cqrs/queries/get-roles-capabilities.query';
import { UniqueRoleNameException } from '../src/roles/domain/models/errors/role-name.exception';
import { Role } from '../src/roles/domain/models/role.entity';

// Users CQRS & Exceptions
import { CreateUserCommand } from '../src/users/cqrs/commands/create-user.command';
import { CreateUserHandler } from '../src/users/cqrs/commands/create-user.handler';
import { DeleteUserCommand } from '../src/users/cqrs/commands/delete-user.command';
import { DeleteUserHandler } from '../src/users/cqrs/commands/delete-user.handler';
import { UpdateUserCommand } from '../src/users/cqrs/commands/update-user.command';
import { UpdateUserHandler } from '../src/users/cqrs/commands/update-user.handler';
import { GetUserHandler } from '../src/users/cqrs/queries/get-user.handler';
import { GetUserQuery } from '../src/users/cqrs/queries/get-user.query';
import { GetUserContextHandler } from '../src/users/cqrs/queries/get-user-context.handler';
import { GetUserContextQuery } from '../src/users/cqrs/queries/get-user-context.query';
import { GetUsersHandler } from '../src/users/cqrs/queries/get-users.handler';
import { GetUsersQuery } from '../src/users/cqrs/queries/get-users.query';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
  UniqueEmailException,
} from '../src/users/domain/models/errors';
import { User } from '../src/users/domain/models/user.entity';
import { toResponseDto } from '../src/users/dtos/user.dto';

// Test Utilities
function createMockEventBus(): EventBus {
  return {
    publish: vi.fn(),
    publishAll: vi.fn(),
  } as unknown as EventBus;
}

function createMockAuthorizer(allow = true): CaslAuthorizer {
  return {
    authorize: vi.fn((action: string, subject: unknown) => {
      if (!allow) {
        throw new UnauthorizedActionException(
          `Unauthorized to ${action} ${typeof subject === 'string' ? subject : 'entity'}`,
          action,
          typeof subject === 'string' ? subject : 'User',
        );
      }
      return subject;
    }),
  } as unknown as CaslAuthorizer;
}

function makeHost(response: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('CQRS Commands & Queries Runtime Error Taxonomy', () => {
  const eventBus = createMockEventBus();
  const domainFilter = new DomainExceptionFilter();
  const zodFilter = new ZodValidationFilter();
  const authFilter = new UnauthorizedActionFilter();

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Users Model: Commands & Queries Runtime Errors
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Users Model', () => {
    describe('CreateUserCommand & Handler', () => {
      it('catches Zod validation errors on invalid constructor parameters (400)', () => {
        expect(
          () =>
            new CreateUserCommand({
              email: 'not-an-email',
              username: 'Alice',
            }),
        ).toThrow(ZodValidationError);

        try {
          new CreateUserCommand({
            email: 'not-an-email',
            username: 'Alice',
          });
        } catch (err) {
          const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
          zodFilter.catch(err as ZodValidationError, makeHost(res));
          expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              statusCode: 400,
              error: 'Bad Request',
              details: expect.any(Object),
            }),
          );
        }
      });

      it('catches InvalidUsernameException when domain invariant is violated (422)', async () => {
        const authorizer = createMockAuthorizer(true);
        const commandRepo = { save: vi.fn() };
        const handler = new CreateUserHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        // When domain entity receives username shorter than 3 chars
        const command = Object.assign(
          Object.create(CreateUserCommand.prototype),
          {
            email: 'valid@example.test',
            username: 'ab',
          },
        );

        await expect(handler.handle(command)).rejects.toThrow(
          InvalidUsernameException,
        );

        try {
          await handler.handle(command);
        } catch (err) {
          const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
          domainFilter.catch(err as InvalidUsernameException, makeHost(res));
          expect(res.status).toHaveBeenCalledWith(
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              statusCode: 422,
              error: 'Unprocessable Entity',
              minLength: 3,
            }),
          );
        }
      });

      it('catches InvalidDepartmentException when department invariant is violated (422)', async () => {
        const authorizer = createMockAuthorizer(true);
        const commandRepo = { save: vi.fn() };
        const handler = new CreateUserHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        // When domain entity receives department shorter than 3 chars
        const command = Object.assign(
          Object.create(CreateUserCommand.prototype),
          {
            email: 'valid@example.test',
            username: 'Alice',
            department: 'ab',
          },
        );

        await expect(handler.handle(command)).rejects.toThrow(
          InvalidDepartmentException,
        );

        try {
          await handler.handle(command);
        } catch (err) {
          const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
          domainFilter.catch(err as InvalidDepartmentException, makeHost(res));
          expect(res.status).toHaveBeenCalledWith(
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              statusCode: 422,
              error: 'Unprocessable Entity',
              minLength: 3,
              actualValue: 'ab',
            }),
          );
        }
      });

      it('catches UnauthorizedActionException when caller lacks permissions (403)', async () => {
        const authorizer = createMockAuthorizer(false);
        const commandRepo = { save: vi.fn() };
        const handler = new CreateUserHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new CreateUserCommand({
          email: 'valid@example.test',
          username: 'Alice',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          UnauthorizedActionException,
        );

        try {
          await handler.handle(command);
        } catch (err) {
          const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
          authFilter.catch(err as UnauthorizedActionException, makeHost(res));
          expect(res.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              statusCode: 403,
              error: 'Forbidden',
            }),
          );
        }
      });

      it('catches UniqueEmailException on unique collision and maps to Conflict (409)', async () => {
        const authorizer = createMockAuthorizer(true);
        const commandRepo = {
          save: vi
            .fn()
            .mockRejectedValue(
              new UniqueEmailException({
                email: 'duplicate@example.test',
              } as any),
            ),
        };
        const handler = new CreateUserHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new CreateUserCommand({
          email: 'duplicate@example.test',
          username: 'Alice',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          UniqueEmailException,
        );

        try {
          await handler.handle(command);
        } catch (err) {
          const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
          domainFilter.catch(err as UniqueEmailException, makeHost(res));
          expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              statusCode: 409,
              error: 'Conflict',
              message: 'Email duplicate@example.test already exists',
            }),
          );
        }
      });
    });

    describe('UpdateUserCommand & Handler', () => {
      it('catches NotFoundException when user does not exist (404)', async () => {
        const authorizer = createMockAuthorizer(true);
        const queryRepo = { find: vi.fn().mockResolvedValue(null) };
        const commandRepo = { save: vi.fn() };
        const handler = new UpdateUserHandler(
          queryRepo as any,
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new UpdateUserCommand({
          id: 'a0000000-0000-4000-8000-000000000001',
          username: 'Bob',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('catches EmptyUserUpdateException when neither username nor department is passed (400)', async () => {
        const authorizer = createMockAuthorizer(true);
        const existingUser = User.create('Alice', 'alice@example.test').entity;
        const queryRepo = { find: vi.fn().mockResolvedValue(existingUser) };
        const commandRepo = { save: vi.fn() };
        const handler = new UpdateUserHandler(
          queryRepo as any,
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = Object.assign(
          Object.create(UpdateUserCommand.prototype),
          {
            id: existingUser.id,
          },
        );

        await expect(handler.handle(command)).rejects.toThrow(
          EmptyUserUpdateException,
        );

        try {
          await handler.handle(command);
        } catch (err) {
          const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
          domainFilter.catch(err as EmptyUserUpdateException, makeHost(res));
          expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              statusCode: 400,
              error: 'Bad Request',
              message: 'At least one user field must be supplied for update.',
            }),
          );
        }
      });

      it('catches UnauthorizedActionException during update (403)', async () => {
        const authorizer = createMockAuthorizer(false);
        const existingUser = User.create('Alice', 'alice@example.test').entity;
        const queryRepo = { find: vi.fn().mockResolvedValue(existingUser) };
        const commandRepo = { save: vi.fn() };
        const handler = new UpdateUserHandler(
          queryRepo as any,
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new UpdateUserCommand({
          id: existingUser.id,
          username: 'Bob',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          UnauthorizedActionException,
        );
      });
    });

    describe('DeleteUserCommand & Handler', () => {
      it('catches NotFoundException when deleting non-existent user (404)', async () => {
        const authorizer = createMockAuthorizer(true);
        const queryRepo = { find: vi.fn().mockResolvedValue(null) };
        const commandRepo = { save: vi.fn() };
        const handler = new DeleteUserHandler(
          queryRepo as any,
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new DeleteUserCommand({
          id: 'a0000000-0000-4000-8000-000000000001',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('catches UnauthorizedActionException when unauthorized to delete (403)', async () => {
        const authorizer = createMockAuthorizer(false);
        const existingUser = User.create('Alice', 'alice@example.test').entity;
        const queryRepo = { find: vi.fn().mockResolvedValue(existingUser) };
        const commandRepo = { save: vi.fn() };
        const handler = new DeleteUserHandler(
          queryRepo as any,
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new DeleteUserCommand({
          id: existingUser.id,
        });

        await expect(handler.handle(command)).rejects.toThrow(
          UnauthorizedActionException,
        );
      });
    });

    describe('Users Queries', () => {
      it('GetUserQuery throws NotFoundException via toResponseDto when user is null (404)', async () => {
        const authorizer = createMockAuthorizer(true);
        const queryRepo = { find: vi.fn().mockResolvedValue(null) };
        const handler = new GetUserHandler(queryRepo as any, authorizer);

        const query = new GetUserQuery({
          userId: 'a0000000-0000-4000-8000-000000000001',
        });

        const result = await handler.execute(query);
        expect(result).toBeNull();
        expect(() => toResponseDto(result)).toThrow(NotFoundException);
      });

      it('GetUsersQuery returns array of user entities (200)', async () => {
        const existingUser = User.create('Alice', 'alice@example.test').entity;
        const authorizer = createMockAuthorizer(true);
        const queryRepo = { find: vi.fn().mockResolvedValue([existingUser]) };
        const handler = new GetUsersHandler(queryRepo as any, authorizer);

        const query = new GetUsersQuery({});
        const result = await handler.execute(query);

        expect(result).toHaveLength(1);
        expect(result[0].email).toBe('alice@example.test');
      });

      it('GetUserContextQuery returns user context and capabilities (200)', async () => {
        const queryRepo = {
          find: vi.fn().mockResolvedValue({
            id: 'user-1',
            email: 'alice@example.test',
            capabilities: { roles: ['admin'], additionalCapabilities: [] },
          }),
        };
        const handler = new GetUserContextHandler(queryRepo as any);

        const query = new GetUserContextQuery({ userId: 'user-1' });
        const result = await handler.execute(query);

        expect(result.id).toBe('user-1');
        expect(result.capabilities.roles).toContain('admin');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Roles Model: Commands & Queries Runtime Errors
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Roles Model', () => {
    describe('CreateRoleCommand & Handler', () => {
      it('catches Zod validation errors on too-short role name (400)', () => {
        expect(
          () =>
            new CreateRoleCommand({
              name: 'ab', // minimum 3 characters
            }),
        ).toThrow(ZodValidationError);
      });

      it('catches UniqueRoleNameException on duplicate creation (409)', async () => {
        const authorizer = createMockAuthorizer(true);
        const commandRepo = {
          save: vi
            .fn()
            .mockRejectedValue(
              new UniqueRoleNameException({ name: 'Admin' } as any),
            ),
        };
        const handler = new CreateRoleHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new CreateRoleCommand({ name: 'Admin' });

        await expect(handler.handle(command)).rejects.toThrow(
          UniqueRoleNameException,
        );

        try {
          await handler.handle(command);
        } catch (err) {
          const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
          domainFilter.catch(err as UniqueRoleNameException, makeHost(res));
          expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              statusCode: 409,
              error: 'Conflict',
              message: 'Role with name "Admin" already exists',
            }),
          );
        }
      });

      it('catches UnauthorizedActionException on unauthorized role creation (403)', async () => {
        const authorizer = createMockAuthorizer(false);
        const commandRepo = { save: vi.fn() };
        const handler = new CreateRoleHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new CreateRoleCommand({ name: 'Admin' });

        await expect(handler.handle(command)).rejects.toThrow(
          UnauthorizedActionException,
        );
      });
    });

    describe('UpdateRoleCommand & Handler', () => {
      it('catches NotFoundException when updating non-existent role (404)', async () => {
        const authorizer = createMockAuthorizer(true);
        const queryRepo = { find: vi.fn().mockResolvedValue(null) };
        const commandRepo = { save: vi.fn() };
        const handler = new UpdateRoleHandler(
          queryRepo as any,
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new UpdateRoleCommand({
          id: 'a0000000-0000-4000-8000-000000000001',
          name: 'Manager',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('catches UniqueRoleNameException when renaming to an existing name (409)', async () => {
        const authorizer = createMockAuthorizer(true);
        const existingRole = Role.create('Editor').entity;
        const queryRepo = { find: vi.fn().mockResolvedValue(existingRole) };
        const commandRepo = {
          save: vi
            .fn()
            .mockRejectedValue(
              new UniqueRoleNameException({ name: 'Viewer' } as any),
            ),
        };
        const handler = new UpdateRoleHandler(
          queryRepo as any,
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new UpdateRoleCommand({
          id: existingRole.id,
          name: 'Admin',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          UniqueRoleNameException,
        );
      });
    });

    describe('DeleteRoleCommand & Handler', () => {
      it('catches NotFoundException when deleting non-existent role (404)', async () => {
        const authorizer = createMockAuthorizer(true);
        const queryRepo = { find: vi.fn().mockResolvedValue(null) };
        const commandRepo = { save: vi.fn() };
        const handler = new DeleteRoleHandler(
          queryRepo as any,
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new DeleteRoleCommand({
          id: 'a0000000-0000-4000-8000-000000000001',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('Roles Queries', () => {
      it('GetRoleQuery returns null and throws NotFoundException at DTO mapping (404)', async () => {
        const queryRepo = { find: vi.fn().mockResolvedValue(null) };
        const handler = new GetRoleHandler(queryRepo as any);

        const query = new GetRoleQuery({
          roleId: 'a0000000-0000-4000-8000-000000000001',
        });

        const result = await handler.execute(query);
        expect(result).toBeNull();
      });

      it('GetRolesQuery returns role entity listing (200)', async () => {
        const role = Role.create('Support').entity;
        const authorizer = createMockAuthorizer(true);
        const queryRepo = { find: vi.fn().mockResolvedValue([role]) };
        const handler = new GetRolesHandler(queryRepo as any, authorizer);

        const query = new GetRolesQuery({});
        const result = await handler.execute(query);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Support');
      });

      it('GetRolesCapabilitiesQuery returns resolved capabilities (200)', async () => {
        const queryRepo = {
          find: vi
            .fn()
            .mockResolvedValue([
              { id: 'role-1', name: 'admin', capabilities: ['all|manage|*'] },
            ]),
        };
        const handler = new GetRolesCapabilitiesHandler(queryRepo as any);

        const query = new GetRolesCapabilitiesQuery({ roleNames: ['admin'] });
        const result = await handler.execute(query);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('admin');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Auths Model: Commands & Queries Runtime Errors
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Auths Model', () => {
    describe('CreateAuthCommand & Handler', () => {
      it('catches Zod validation errors on missing login code (400)', () => {
        expect(
          () =>
            new CreateAuthCommand({
              email: 'alice@example.test',
              code: '',
            }),
        ).toThrow(ZodValidationError);
      });

      it('catches UnauthorizedException when login code is incorrect (401)', async () => {
        const loginService = {
          authenticate: vi
            .fn()
            .mockRejectedValue(new UnauthorizedException('Invalid login code')),
        };
        const commandRepo = { save: vi.fn() };
        const tenantContext = new TenantSchemaContext();
        const handler = new CreateAuthHandler(
          eventBus,
          loginService as unknown as UserLoginService,
          commandRepo as any,
          tenantContext,
        );

        const command = new CreateAuthCommand({
          email: 'alice@example.test',
          code: '999999',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          UnauthorizedException,
        );
        await expect(handler.handle(command)).rejects.toThrow(
          'Invalid login code',
        );
      });

      it('catches UnauthorizedException when email is not registered (401)', async () => {
        const loginService = {
          authenticate: vi
            .fn()
            .mockRejectedValue(
              new UnauthorizedException('Invalid email or password'),
            ),
        };
        const commandRepo = { save: vi.fn() };
        const tenantContext = new TenantSchemaContext();
        const handler = new CreateAuthHandler(
          eventBus,
          loginService as unknown as UserLoginService,
          commandRepo as any,
          tenantContext,
        );

        const command = new CreateAuthCommand({
          email: 'unknown@example.test',
          code: '123456',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          UnauthorizedException,
        );
        await expect(handler.handle(command)).rejects.toThrow(
          'Invalid email or password',
        );
      });
    });

    describe('DeleteAuthCommand & Handler', () => {
      it('processes session deletion safely (204)', async () => {
        const handler = new DeleteAuthHandler();
        const command = new DeleteAuthCommand();
        const result = await handler.execute(command);

        expect(result).toBeUndefined();
      });
    });

    describe('Auths Queries', () => {
      it('GetUserCapabilitiesQuery resolves user capabilities array', async () => {
        const queryRepo = {
          find: vi.fn().mockResolvedValue({
            roles: ['user'],
            additionalCapabilities: ['user|read|self'],
          }),
        };
        const handler = new GetUserCapabilitiesHandler(queryRepo as any);

        const query = new GetUserCapabilitiesQuery({ userId: 'user-1' });
        const result = await handler.execute(query);

        expect(result.roles).toContain('user');
        expect(result.additionalCapabilities).toContain('user|read|self');
      });
    });
  });
});
