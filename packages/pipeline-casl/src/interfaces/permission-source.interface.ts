/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { Capability } from '../types/casl.types';

/** The authenticated caller. Attributes are available to `${user.<path>}` placeholders. */
export interface CaslPrincipal {
  readonly id: string;
  readonly [attribute: string]: unknown;
}

export interface CaslAuthorizationInput {
  readonly principal: CaslPrincipal;
  /** The caller's rules in any order; direct rules are applied before inverted ones. */
  readonly rules: readonly Capability[];
}

/**
 * Application port: resolves the caller and their rules for one pipeline
 * execution. Return `null` when the caller is unauthenticated.
 */
export interface ICaslPermissionSource {
  load(context: IPipelineContext): Promise<CaslAuthorizationInput | null>;
}
