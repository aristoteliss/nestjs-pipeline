/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CacheEntrySchema } from '@cqrs-ddd/mikro-orm';
import { AuthSchema } from './schemas/auth.schema.js';
import { CapabilitySchema } from './schemas/capability.schema.js';
import { ConsumedRefreshTokenSchema } from './schemas/consumed-refresh-token.schema.js';
import { RoleSchema } from './schemas/role.schema.js';
import { RoleCapabilitySchema } from './schemas/role-capability.schema.js';
import { UserSchema } from './schemas/user.schema.js';
import { UserAdditionalCapabilitySchema } from './schemas/user-additional-capability.schema.js';
import { UserDeniedCapabilitySchema } from './schemas/user-denied-capability.schema.js';
import { UserPermissionRuleSchema } from './schemas/user-permission-rule.schema.js';
import { UserRoleSchema } from './schemas/user-role.schema.js';

/** Entity schemas registered by every persistence engine. */
export const PERSISTENCE_ENTITIES = [
  UserSchema,
  RoleSchema,
  CapabilitySchema,
  RoleCapabilitySchema,
  UserRoleSchema,
  UserAdditionalCapabilitySchema,
  UserDeniedCapabilitySchema,
  UserPermissionRuleSchema,
  AuthSchema,
  ConsumedRefreshTokenSchema,
  CacheEntrySchema,
];
