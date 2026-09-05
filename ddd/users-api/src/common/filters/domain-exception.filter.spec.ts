import type { ArgumentsHost } from '@nestjs/common';
import { DomainException } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { UniqueRoleNameException } from '../../roles/domain/models/errors/role-name.exception';
import {
  EmptyUserUpdateException,
  InvalidDepartmentException,
  InvalidUsernameException,
  UniqueEmailException,
} from '../../users/domain/models/errors';
import { User } from '../../users/domain/models/user.entity';
import { DomainExceptionFilter } from './domain-exception.filter';

class UnclassifiedDomainException extends DomainException {
  constructor() {
    super('Unclassified business violation');
  }
}

function makeHost(response: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it('maps UniqueEmailException to HTTP 409 Conflict', () => {
    const user = User.create('Alice', 'alice@example.test').entity;
    const error = new UniqueEmailException(user);
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    filter.catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'Conflict',
      message: error.message,
    });
  });

  it('maps UniqueRoleNameException to HTTP 409 Conflict', () => {
    const error = new UniqueRoleNameException('Admin');
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    filter.catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 409,
      error: 'Conflict',
      message: 'Role with name "Admin" already exists',
    });
  });

  it('maps InvalidUsernameException to HTTP 422 Unprocessable Entity with constraint details', () => {
    const error = new InvalidUsernameException(3, 'Al');
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    filter.catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: error.message,
      minLength: 3,
      actualValue: 'Al',
    });
  });

  it('maps InvalidDepartmentException to HTTP 422 Unprocessable Entity with constraint details', () => {
    const error = new InvalidDepartmentException(3, 'IT');
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    filter.catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: error.message,
      minLength: 3,
      actualValue: 'IT',
    });
  });

  it('maps EmptyUserUpdateException to HTTP 400 Bad Request', () => {
    const error = new EmptyUserUpdateException();
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    filter.catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: 'At least one user field must be supplied for update.',
    });
  });

  it('maps unclassified DomainException to HTTP 400 Bad Request as a safe fallback', () => {
    const error = new UnclassifiedDomainException();
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);

    filter.catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Unclassified business violation',
    });
  });

  it('uses Fastify send() when json() is not available', () => {
    const error = new EmptyUserUpdateException();
    const response = { status: vi.fn(), send: vi.fn() };
    response.status.mockReturnValue(response);

    filter.catch(error, makeHost(response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.send).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: 'At least one user field must be supplied for update.',
    });
  });
});
