/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { CaslAuthorizer, Projected } from '@nestjs-pipeline/casl';
import type { User } from '../domain/models/user.entity';

interface UserReadCandidate {
  id: string;
  username: string;
  email: string;
  department?: string | null;
}

/** The fields of a User the current caller may read; any field can be absent. */
export type UserReadModel = Projected<UserReadCandidate>;

export function projectUserRead(
  authorizer: CaslAuthorizer,
  user: User,
): UserReadModel {
  return authorizer.project('read', user, {
    id: user.id,
    username: user.username,
    email: user.email,
    department: user.department,
  });
}
