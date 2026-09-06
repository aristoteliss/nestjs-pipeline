import { UserAdditionalCapability } from '@persistence/entities/user-additional-capability.entity';
import { UserDeniedCapability } from '@persistence/entities/user-denied-capability.entity';
import { UserRole } from '@persistence/entities/user-role.entity';
import { describe, expect, it, vi } from 'vitest';
import { Capability } from '../../roles/domain/models/capability.entity';
import { Role } from '../../roles/domain/models/role.entity';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';
import { GetUserCapabilitiesQueryRepository } from './get-user-capabilities.query-repository';

describe('GetUserCapabilitiesQueryRepository', () => {
  it('uses schema-aware entity operations instead of raw SQL', async () => {
    const role = Role.create('admin');
    const additional = Capability.create('read', 'User');
    const denied = Capability.create('delete', 'User', null, true);
    const find = vi.fn(async (entity: unknown) => {
      if (entity === UserRole) return [{ userId: 'user-1', roleId: role.id }];
      if (entity === UserAdditionalCapability) {
        return [{ userId: 'user-1', capabilityId: additional.id }];
      }
      if (entity === UserDeniedCapability) {
        return [{ userId: 'user-1', capabilityId: denied.id }];
      }
      if (entity === Role) return [role];
      if (entity === Capability) {
        return find.mock.calls.filter((call) => call[0] === Capability)
          .length === 1
          ? [additional]
          : [denied];
      }
      return [];
    });
    const execute = vi.fn();
    const repository = new GetUserCapabilitiesQueryRepository({
      get em() {
        return { find, execute };
      },
    } as never);

    const result = await repository.find(
      new GetUserCapabilitiesQuery({ userId: 'user-1' }),
    );
    await repository.find(new GetUserCapabilitiesQuery({ userId: 'user-1' }));

    expect(execute).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(12);
    expect(result.roles).toEqual(['admin']);
    expect(result.additionalCapabilities).toEqual([
      expect.objectContaining({ subject: 'User', action: 'read' }),
    ]);
    expect(result.deniedCapabilities).toEqual([
      expect.objectContaining({
        subject: 'User',
        action: 'delete',
        inverted: true,
      }),
    ]);
  });
});
