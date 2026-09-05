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
import { Injectable, Optional } from '@nestjs/common';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { CASL_ABILITY_KEY } from '../constants/tokens';
import { UnauthorizedActionException } from '../exceptions/unauthorized-action.exception';
import type { IEntityAuthorizer } from '../interfaces/entity-authorizer.interface';
import type { AppAbility, CaslUserContext } from '../types/casl.types';

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
 * Pluggable authorizer service backed by CASL.
 *
 * Exposes generic `authorize()` and `can()` methods usable both inside pipeline
 * behaviors (with string subjects) and inside application command/query handlers
 * (with loaded entity instances).
 */
@Injectable()
export class CaslAuthorizer implements IEntityAuthorizer {
  constructor(@Optional() private readonly ability?: AppAbility) {}

  /**
   * Evaluates permissions and returns the authorized subject or masked snapshot,
   * or throws an {@link UnauthorizedActionException} if access is forbidden.
   */
  authorize<T = unknown>(
    action: string,
    subject: object | string,
    fields?: string[],
  ): T;
  authorize<T = unknown>(
    actorOrAbility: CaslUserContext | AppAbility | undefined,
    action: string,
    subject: object | string,
    fields?: string[],
  ): T;
  authorize<T = unknown>(...args: unknown[]): T {
    let ability: AppAbility | undefined;
    let action: string;
    let subject: object | string;
    let fields: string[] | undefined;

    if (
      args.length >= 3 &&
      typeof args[1] === 'string' &&
      (typeof args[0] !== 'string' ||
        !['create', 'read', 'update', 'delete', 'manage'].includes(args[0]))
    ) {
      // (actorOrAbility, action, subject, fields?)
      const [actorOrAbility, act, subj, flds] = args;
      action = act as string;
      subject = subj as object | string;
      fields = flds as string[] | undefined;

      if (
        actorOrAbility &&
        typeof (actorOrAbility as AppAbility).can === 'function'
      ) {
        ability = actorOrAbility as AppAbility;
      } else {
        ability = this.ability ?? getCaslAbility();
      }
    } else {
      // (action, subject, fields?)
      const [act, subj, flds] = args;
      action = act as string;
      subject = subj as object | string;
      fields = flds as string[] | undefined;
      ability = this.ability ?? getCaslAbility();
    }

    if (!ability) {
      return (
        typeof (subject as { toJSON?: () => unknown })?.toJSON === 'function'
          ? (subject as { toJSON: () => unknown }).toJSON()
          : subject
      ) as T;
    }

    const { subjectType, entityRecord, entityId, typedSubject } =
      this.resolveSubjectInfo(subject);

    if (action === 'read') {
      if (!ability.can('read', typedSubject)) {
        throw new UnauthorizedActionException({
          action: 'read',
          subject: subjectType,
          entityId,
          reason: `Access denied: insufficient permissions to read ${subjectType}.`,
        });
      }

      if (entityRecord) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(entityRecord)) {
          if (ability.can('read', typedSubject, key)) {
            result[key] = value;
          }
        }
        return result as T;
      }

      return (entityRecord ?? subject) as T;
    }

    if (fields && fields.length > 0) {
      for (const field of fields) {
        const fieldStr = String(field);
        if (!ability.can(action, typedSubject, fieldStr)) {
          throw new UnauthorizedActionException({
            action,
            subject: subjectType,
            entityId,
            fields: [fieldStr],
            reason: `Access denied: insufficient permissions to ${action} ${subjectType} field "${fieldStr}".`,
          });
        }
      }
    } else if (!ability.can(action, typedSubject)) {
      throw new UnauthorizedActionException({
        action,
        subject: subjectType,
        entityId,
        reason: `Access denied: insufficient permissions to ${action} ${subjectType}.`,
      });
    }

    return (entityRecord ?? subject) as T;
  }

  /**
   * Check whether the action is permitted on the given subject/field.
   */
  can(action: string, subject: object | string, field?: string): boolean;
  can(
    action: string,
    subject: string,
    entity: Record<string, unknown>,
    field?: string,
  ): boolean;
  can(...args: unknown[]): boolean {
    const ability = this.ability ?? getCaslAbility();
    if (!ability) return true;

    if (
      args.length >= 3 &&
      typeof args[1] === 'string' &&
      typeof args[2] === 'object' &&
      args[2] !== null
    ) {
      // Legacy 4-arg signature from IEntityAuthorizer: can(action, subjectStr, entityRecord, field?)
      const [action, subjectStr, entityRecord, field] = args as [
        string,
        string,
        Record<string, unknown>,
        string?,
      ];
      const typed = caslSubject(subjectStr, {
        ...entityRecord,
      }) as unknown as string;
      return field
        ? ability.can(action, typed, field)
        : ability.can(action, typed);
    }

    const [action, subject, field] = args as [string, object | string, string?];
    const { typedSubject } = this.resolveSubjectInfo(subject);
    return field
      ? ability.can(action, typedSubject, field)
      : ability.can(action, typedSubject);
  }

  private resolveSubjectInfo(subject: object | string): {
    subjectType: string;
    entityRecord?: Record<string, unknown>;
    entityId?: string | number;
    typedSubject: string;
  } {
    if (typeof subject === 'string') {
      return {
        subjectType: subject,
        typedSubject: subject,
      };
    }

    const subjectType =
      subject.constructor?.name && subject.constructor.name !== 'Object'
        ? subject.constructor.name
        : 'Object';

    const entityRecord: Record<string, unknown> =
      typeof (subject as { toJSON?: () => unknown }).toJSON === 'function'
        ? ((subject as { toJSON: () => unknown }).toJSON() as Record<
            string,
            unknown
          >)
        : (subject as Record<string, unknown>);

    const entityId =
      (subject as { id?: string | number }).id ??
      (entityRecord?.id as string | number | undefined);

    const typedSubject = caslSubject(subjectType, {
      ...entityRecord,
    }) as unknown as string;

    return {
      subjectType,
      entityRecord,
      entityId,
      typedSubject,
    };
  }
}

/**
 * Backward compatibility alias for {@link CaslAuthorizer}.
 */
export const CaslEntityAuthorizer = CaslAuthorizer;
export type CaslEntityAuthorizer = CaslAuthorizer;
