/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { CaslAuthorizer, Projected } from '@nestjs-pipeline/casl';
import type { Role } from '../domain/models/role.entity';

interface RoleReadCandidate {
  id: string;
  name: string;
}

/** The fields of a Role the current caller may read; any field can be absent. */
export type RoleReadModel = Projected<RoleReadCandidate>;

export function projectRoleRead(
  authorizer: CaslAuthorizer,
  role: Role,
): RoleReadModel {
  return authorizer.project('read', role, { id: role.id, name: role.name });
}
