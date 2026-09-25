/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CacheEntrySchema } from '@nestjs-pipeline/ddd-core/persistence';
import { AuthSchema } from './schemas/auth.schema';
import { CapabilitySchema } from './schemas/capability.schema';
import { ConsumedRefreshTokenSchema } from './schemas/consumed-refresh-token.schema';
import { RoleSchema } from './schemas/role.schema';
import { RoleCapabilitySchema } from './schemas/role-capability.schema';
import { UserSchema } from './schemas/user.schema';
import { UserAdditionalCapabilitySchema } from './schemas/user-additional-capability.schema';
import { UserDeniedCapabilitySchema } from './schemas/user-denied-capability.schema';
import { UserPermissionRuleSchema } from './schemas/user-permission-rule.schema';
import { UserRoleSchema } from './schemas/user-role.schema';

/** Entity schemas registered by every persistence engine. */
export const PERSISTENCE_ENTITIES = [
  UserSchema,
  AuthSchema,
  RoleSchema,
  CapabilitySchema,
  RoleCapabilitySchema,
  UserRoleSchema,
  UserAdditionalCapabilitySchema,
  UserDeniedCapabilitySchema,
  UserPermissionRuleSchema,
  ConsumedRefreshTokenSchema,
  CacheEntrySchema,
];
