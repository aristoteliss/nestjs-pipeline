/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntityNotFoundException } from '@cqrs-ddd/core/domain';
import {
  type ArgumentsHost,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import type { EventBus } from '@nestjs/cqrs';
import {
  CaslAuthorizer,
  UnauthorizedActionException,
  UnauthorizedActionFilter,
} from '@nestjs-pipeline/casl';
import { ZodValidationError, ZodValidationFilter } from '@nestjs-pipeline/zod';
import { describe, expect, it, vi } from 'vitest';
// Auths CQRS & Services
import { CreateAuthCommand } from '../src/auths/application/cqrs/commands/create-auth.command.js';
import { CreateAuthHandler } from '../src/auths/application/cqrs/commands/create-auth.handler.js';
import { RevokeAuthCommand } from '../src/auths/application/cqrs/commands/revoke-auth.command.js';
import { RevokeAuthHandler } from '../src/auths/application/cqrs/commands/revoke-auth.handler.js';
import { GetUserPermissionRulesHandler } from '../src/auths/application/cqrs/queries/get-user-permission-rules.handler.js';
import { GetUserPermissionRulesQuery } from '../src/auths/application/cqrs/queries/get-user-permission-rules.query.js';
import { InvalidRefreshTokenError } from '../src/auths/domain/errors/refresh-token.errors.js';
import { NodeRefreshTokens } from '../src/auths/infrastructure/node-refresh-tokens.js';
import { PrincipalLoginService } from '../src/auths/services/principal-login.service.js';
// Filters
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter.js';

// Roles CQRS & Exceptions
import { CreateRoleCommand } from '../src/roles/application/cqrs/commands/create-role.command.js';
import { CreateRoleHandler } from '../src/roles/application/cqrs/commands/create-role.handler.js';
import { DeleteRoleCommand } from '../src/roles/application/cqrs/commands/delete-role.command.js';
import { DeleteRoleHandler } from '../src/roles/application/cqrs/commands/delete-role.handler.js';
import { UpdateRoleCommand } from '../src/roles/application/cqrs/commands/update-role.command.js';
import { UpdateRoleHandler } from '../src/roles/application/cqrs/commands/update-role.handler.js';
import { GetRoleHandler } from '../src/roles/application/cqrs/queries/get-role.handler.js';
import { GetRoleQuery } from '../src/roles/application/cqrs/queries/get-role.query.js';
import { GetRolesHandler } from '../src/roles/application/cqrs/queries/get-roles.handler.js';
import { GetRolesQuery } from '../src/roles/application/cqrs/queries/get-roles.query.js';
import { UniqueRoleNameException } from '../src/roles/domain/models/errors/role-name.exception.js';
import { Role } from '../src/roles/domain/models/role.entity.js';
// Users CQRS & Exceptions
import { CreateUserCommand } from '../src/users/application/cqrs/commands/create-user.command.js';
import { CreateUserHandler } from '../src/users/application/cqrs/commands/create-user.handler.js';
import { DeleteUserCommand } from '../src/users/application/cqrs/commands/delete-user.command.js';
import { DeleteUserHandler } from '../src/users/application/cqrs/commands/delete-user.handler.js';
import { UpdateUserCommand } from '../src/users/application/cqrs/commands/update-user.command.js';
import { UpdateUserHandler } from '../src/users/application/cqrs/commands/update-user.handler.js';
import { GetUserHandler } from '../src/users/application/cqrs/queries/get-user.handler.js';
import { GetUserQuery } from '../src/users/application/cqrs/queries/get-user.query.js';
import { GetUsersHandler } from '../src/users/application/cqrs/queries/get-users.handler.js';
import { GetUsersQuery } from '../src/users/application/cqrs/queries/get-users.query.js';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
  UniqueEmailException,
} from '../src/users/domain/models/errors/index.js';
import { User } from '../src/users/domain/models/user.entity.js';
import { toResponseDto } from '../src/users/dtos/user.dto.js';
import { GetRolesCapabilitiesHandler } from './support/roles-capabilities/get-roles-capabilities.handler.js';
import { GetRolesCapabilitiesQuery } from './support/roles-capabilities/get-roles-capabilities.query.js';

// Test Utilities
function createMockEventBus(): EventBus {
  return {
    publish: vi.fn(),
    publishAll: vi.fn(),
  } as unknown as EventBus;
}

function createMockAuthorizer(allow = true): CaslAuthorizer {
  const check = (action: string, subject: unknown) => {
    if (!allow) {
      throw new UnauthorizedActionException({
        action,
        subject: typeof subject === 'string' ? subject : 'User',
      });
    }
  };
  return {
    can: vi.fn(() => allow),
    dependsOnEntity: vi.fn(() => false),
    authorize: vi.fn(check),
    project: vi.fn((action: string, subject: unknown, candidate: unknown) => {
      check(action, subject);
      return candidate;
    }),
  } as unknown as CaslAuthorizer;
}

function makeHost(response: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

/** Answers through the fake response, as Express's adapter does. */
const adapterHost = {
  httpAdapter: {
    reply: (
      response: { status(code: number): { json(body: unknown): unknown } },
      body: unknown,
      status: number,
    ) => response.status(status).json(body),
  },
} as unknown as HttpAdapterHost;

describe('CQRS Commands & Queries Runtime Error Taxonomy', () => {
  const eventBus = createMockEventBus();
  const domainFilter = new DomainExceptionFilter(adapterHost);
  const zodFilter = new ZodValidationFilter(adapterHost);
  const authFilter = new UnauthorizedActionFilter(adapterHost);

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
              field: 'username',
              rule: 'minLength',
              limit: 3,
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
              field: 'department',
              rule: 'minLength',
              limit: 3,
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
          save: vi.fn().mockRejectedValue(
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
      it('catches EntityNotFoundException when user does not exist (404)', async () => {
        const authorizer = createMockAuthorizer(true);
        const commandRepo = {
          findById: vi.fn().mockResolvedValue(null),
          save: vi.fn(),
        };
        const handler = new UpdateUserHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new UpdateUserCommand({
          id: 'a0000000-0000-4000-8000-000000000001',
          username: 'Bob',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          EntityNotFoundException,
        );
      });

      it('catches EmptyUserUpdateException when neither username nor department is passed (400)', async () => {
        const authorizer = createMockAuthorizer(true);
        const existingUser = User.create('Alice', 'alice@example.test');
        const commandRepo = {
          findById: vi.fn().mockResolvedValue(existingUser),
          save: vi.fn(),
        };
        const handler = new UpdateUserHandler(
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
        const existingUser = User.create('Alice', 'alice@example.test');
        const commandRepo = {
          findById: vi.fn().mockResolvedValue(existingUser),
          save: vi.fn(),
        };
        const handler = new UpdateUserHandler(
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
      it('catches EntityNotFoundException when deleting non-existent user (404)', async () => {
        const authorizer = createMockAuthorizer(true);
        const commandRepo = {
          findById: vi.fn().mockResolvedValue(null),
          save: vi.fn(),
        };
        const handler = new DeleteUserHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new DeleteUserCommand({
          id: 'a0000000-0000-4000-8000-000000000001',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          EntityNotFoundException,
        );
      });

      it('catches UnauthorizedActionException when unauthorized to delete (403)', async () => {
        const authorizer = createMockAuthorizer(false);
        const existingUser = User.create('Alice', 'alice@example.test');
        const commandRepo = {
          findById: vi.fn().mockResolvedValue(existingUser),
          save: vi.fn(),
        };
        const handler = new DeleteUserHandler(
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
        const existingUser = User.create('Alice', 'alice@example.test');
        const authorizer = createMockAuthorizer(true);
        const queryRepo = { find: vi.fn().mockResolvedValue([existingUser]) };
        const handler = new GetUsersHandler(queryRepo as any, authorizer);

        const query = new GetUsersQuery({});
        const result = await handler.execute(query);

        expect(result).toHaveLength(1);
        expect(result[0].email).toBe('alice@example.test');
      });
    });
  });

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
      it('catches EntityNotFoundException when updating non-existent role (404)', async () => {
        const authorizer = createMockAuthorizer(true);
        const commandRepo = {
          findById: vi.fn().mockResolvedValue(null),
          save: vi.fn(),
        };
        const handler = new UpdateRoleHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new UpdateRoleCommand({
          id: 'a0000000-0000-4000-8000-000000000001',
          name: 'Manager',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          EntityNotFoundException,
        );
      });

      it('catches UniqueRoleNameException when renaming to an existing name (409)', async () => {
        const authorizer = createMockAuthorizer(true);
        const existingRole = Role.create('Editor');
        const commandRepo = {
          findById: vi.fn().mockResolvedValue(existingRole),
          save: vi
            .fn()
            .mockRejectedValue(
              new UniqueRoleNameException({ name: 'Viewer' } as any),
            ),
        };
        const handler = new UpdateRoleHandler(
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
      it('catches EntityNotFoundException when deleting non-existent role (404)', async () => {
        const authorizer = createMockAuthorizer(true);
        const commandRepo = {
          findById: vi.fn().mockResolvedValue(null),
          save: vi.fn(),
        };
        const handler = new DeleteRoleHandler(
          commandRepo as any,
          authorizer,
          eventBus,
        );

        const command = new DeleteRoleCommand({
          id: 'a0000000-0000-4000-8000-000000000001',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          EntityNotFoundException,
        );
      });
    });

    describe('Roles Queries', () => {
      it('GetRoleQuery returns null and throws NotFoundException at DTO mapping (404)', async () => {
        const queryRepo = { find: vi.fn().mockResolvedValue(null) };
        const handler = new GetRoleHandler(
          queryRepo as any,
          createMockAuthorizer(true),
        );

        const query = new GetRoleQuery({
          roleId: 'a0000000-0000-4000-8000-000000000001',
        });

        const result = await handler.execute(query);
        expect(result).toBeNull();
      });

      it('GetRolesQuery returns role entity listing (200)', async () => {
        const role = Role.create('Support');
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

        const query = new GetRolesCapabilitiesQuery({ names: ['admin'] });
        const result = await handler.execute(query);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('admin');
      });
    });
  });

  describe('Auths Model', () => {
    describe('CreateAuthCommand & Handler', () => {
      it('catches Zod validation errors on missing login code (400)', () => {
        expect(
          () =>
            new CreateAuthCommand({
              email: 'alice@example.test',
              code: '',
              clientIp: '203.0.113.7',
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
        const handler = new CreateAuthHandler(
          eventBus,
          loginService as unknown as PrincipalLoginService,
          commandRepo as any,
          new NodeRefreshTokens(),
          {
            refreshTokenTtlSeconds: 3600,
            refreshReuseGraceSeconds: 30,
            embedPermissions: false,
          },
          { save: vi.fn(), clear: vi.fn() },
        );

        const command = new CreateAuthCommand({
          email: 'alice@example.test',
          code: '999999',
          clientIp: '203.0.113.7',
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
        const handler = new CreateAuthHandler(
          eventBus,
          loginService as unknown as PrincipalLoginService,
          commandRepo as any,
          new NodeRefreshTokens(),
          {
            refreshTokenTtlSeconds: 3600,
            refreshReuseGraceSeconds: 30,
            embedPermissions: false,
          },
          { save: vi.fn(), clear: vi.fn() },
        );

        const command = new CreateAuthCommand({
          email: 'unknown@example.test',
          code: '123456',
          clientIp: '203.0.113.7',
        });

        await expect(handler.handle(command)).rejects.toThrow(
          UnauthorizedException,
        );
        await expect(handler.handle(command)).rejects.toThrow(
          'Invalid email or password',
        );
      });
    });

    describe('RevokeAuthCommand & Handler', () => {
      it('rejects an unknown refresh token so logout can answer 204 without revoking', async () => {
        const principalLoginService = { revoke: vi.fn() };
        const handler = new RevokeAuthHandler(
          eventBus,
          { find: vi.fn().mockResolvedValue(null) } as any,
          new NodeRefreshTokens(),
          { save: vi.fn(), clear: vi.fn() },
          principalLoginService as any,
        );

        await expect(
          handler.execute(
            new RevokeAuthCommand({
              refreshToken: 'unknown',
              clientIp: '203.0.113.7',
            }),
          ),
        ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
        expect(principalLoginService.revoke).not.toHaveBeenCalled();
      });
    });

    describe('GetUserPermissionRulesQuery & Handler', () => {
      it('catches Zod validation errors on invalid query parameters (400)', () => {
        expect(() => new GetUserPermissionRulesQuery({ userId: '' })).toThrow(
          ZodValidationError,
        );
      });

      it('delegates to the query repository when valid', async () => {
        const queryRepo = { find: vi.fn().mockResolvedValue([]) };
        const handler = new GetUserPermissionRulesHandler(queryRepo as any);
        const query = new GetUserPermissionRulesQuery({ userId: 'u-1' });

        const result = await handler.execute(query);

        expect(result).toEqual([]);
        expect(queryRepo.find).toHaveBeenCalledWith(query);
      });
    });
  });
});
