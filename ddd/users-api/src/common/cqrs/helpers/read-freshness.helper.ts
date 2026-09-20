/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, type AppSubject } from '@common/constants';
import { getCaslAbility, hasEntityConditions } from '@nestjs-pipeline/casl';

/**
 * True when the current caller's read decision on `subject` depends on entity
 * attributes, so a cached snapshot must not decide it.
 */
export function readDependsOnEntityState(subject: AppSubject): boolean {
  const ability = getCaslAbility();
  return !ability || hasEntityConditions(ability, [subject], APP_ACTIONS.READ);
}
