/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { subject as caslSubject } from '@casl/ability';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { CASL_ABILITY_KEY } from '../constants/tokens';
import type { AppAbility } from '../types/casl.types';

/**
 * Retrieve the {@link AppAbility} that {@link CaslBehavior} stored for the
 * current request.
 *
 * `CaslBehavior` runs **before** the handler and only sees the command/query
 * payload — it cannot evaluate conditions that depend on the *persisted* state
 * of the target entity (e.g. "the user being edited belongs to my department").
 * Handlers therefore need to perform a second, instance-level check against the
 * entity they just loaded. This helper exposes the already-built ability so the
 * handler does not have to rebuild it.
 *
 * Pass the pipeline {@link IPipelineContext} explicitly when you have it,
 * otherwise the ability is read from the ambient pipeline async store, which is
 * populated automatically for every pipelined handler.
 *
 * @returns The request's ability, or `undefined` when CASL did not run for this
 *          handler (e.g. no `rules`, `prebuiltAbility`, or `skipCheck`).
 */
export function getCaslAbility(
  context?: IPipelineContext,
): AppAbility | undefined {
  const ctx = context ?? pipelineStore.getStore();
  return ctx?.items.get(CASL_ABILITY_KEY) as AppAbility | undefined;
}

/**
 * Pluggable authorizer implementation for entity instances backed by CASL.
 */
export class CaslEntityAuthorizer {
  constructor(private readonly ability?: AppAbility) {}

  can(
    action: string,
    subject: string,
    entity: Record<string, unknown>,
    field?: string,
  ): boolean {
    const ability = this.ability ?? getCaslAbility();
    if (!ability) return true;
    const typedSubject = caslSubject(subject, {
      ...entity,
    }) as unknown as string;
    return field
      ? ability.can(action, typedSubject, field)
      : ability.can(action, typedSubject);
  }
}

// Automatically register the CASL entity authorizer adapter as the global default authorizer
const globalRegistry = globalThis as typeof globalThis & {
  __PIPELINE_ENTITY_AUTHORIZER__?: CaslEntityAuthorizer;
};
if (!globalRegistry.__PIPELINE_ENTITY_AUTHORIZER__) {
  globalRegistry.__PIPELINE_ENTITY_AUTHORIZER__ = new CaslEntityAuthorizer();
}
