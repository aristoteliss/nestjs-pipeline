/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability, CapabilityString } from '@nestjs-pipeline/casl';

/** A user's assigned roles plus per-user grants and denials. */
export interface UserPermissionAssignments {
  roles: string[];
  additionalCapabilities?: (Capability | CapabilityString)[];
  deniedCapabilities?: (Capability | CapabilityString)[];
}

/** A named role and the rules it grants. */
