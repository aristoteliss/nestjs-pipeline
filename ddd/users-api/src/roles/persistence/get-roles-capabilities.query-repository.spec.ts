import { RoleCapability } from '@persistence/entities/role-capability.entity';
import { describe, expect, it, vi } from 'vitest';
import { GetRolesCapabilitiesQuery } from '../cqrs/queries/get-roles-capabilities.query';
import { Capability } from '../domain/models/capability.entity';
import { Role } from '../domain/models/role.entity';
import { GetRolesCapabilitiesQueryRepository } from './get-roles-capabilities.query-repository';

describe('GetRolesCapabilitiesQueryRepository', () => {
  it('hydrates roles with schema-aware entity operations instead of raw SQL', async () => {
    const role = Role.create('admin').entity;
    const capability = Capability.create('read', 'User');
    const find = vi.fn(async (entity: unknown) => {
      if (entity === Role) return [role];
      if (entity === RoleCapability) {
        return [{ roleId: role.id, capabilityId: capability.id }];
      }
      if (entity === Capability) return [capability];
      return [];
    });
    const execute = vi.fn();
    const repository = new GetRolesCapabilitiesQueryRepository({
      get em() {
        return { find, execute };
      },
    } as never);

    const result = await repository.find(
      new GetRolesCapabilitiesQuery({ names: ['admin'] }),
    );
    await repository.find(new GetRolesCapabilitiesQuery({ names: ['admin'] }));

    expect(execute).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(6);
    expect(result).toEqual([
      {
        name: 'admin',
        capabilities: [
          expect.objectContaining({ subject: 'User', action: 'read' }),
        ],
      },
    ]);
  });
});
