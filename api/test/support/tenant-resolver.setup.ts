/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setTenantResolver } from '@cqrs-ddd/core/application';
import { currentTenantId } from '@nestjs-pipeline/tenant';

// The resolver ObservabilityModule registers, for specs that do not boot it.
setTenantResolver(currentTenantId);
