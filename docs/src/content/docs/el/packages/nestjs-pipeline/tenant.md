---
title: "@nestjs-pipeline/tenant"
description: "Ο τρέχων tenant για εφαρμογές @nestjs-pipeline/core: ο tenant του ενεργού pipeline, ή ο tenant ενός runWithTenant scope"
editUrl: false
---

> **Από την έκδοση 0.5.0 το πακέτο αυτό συνεχίζει ως [`@cqrs-ddd/pipeline-tenant`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-tenant).** Ο κώδικας, τα issues και
> οι εκδόσεις του βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-tenant/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/tenant` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)

Ο τρέχων tenant μιας εκτέλεσης: η συνάρτηση `currentTenantId()` επιστρέφει τον tenant του
εσωτερικότερου `runWithTenant` scope, ώστε κώδικας βαθιά μέσα σε έναν handler να μπορεί να διαβάσει τον tenant χωρίς
να μεταβιβάζεται σε κάθε σημείο κλήσης. Δεν έχει εξωτερικές εξαρτήσεις· το `tenantSource` το συνδέει με pipelines του
[`@nestjs-pipeline/core`](/nestjs-pipeline/packages/nestjs-pipeline/core/)
και με το `@nestjs-pipeline/job-context`.

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-tenant @cqrs-ddd/nestjs
```

Απαιτεί Node.js 22.12 ή νεότερο. Για να παρέχετε τον tenant στα pipelines, περάστε το `tenantSource` στο
`PipelineModule.forRoot`:

```typescript
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

PipelineModule.forRoot({ sources: { tenantId: tenantSource } });
```

## Χρήση <a id="usage"></a>

```typescript
import { currentTenantId, runWithTenant } from '@nestjs-pipeline/tenant';

// Εκεί όπου η εργασία εισέρχεται στην εφαρμογή:
await runWithTenant('tenant_a', () => this.commandBus.execute(command));

// Οπουδήποτε παρακάτω, συμπεριλαμβανομένου μέσα σε έναν handler:
const tenant = currentTenantId(); // 'tenant_a'
```

### HTTP middleware <a id="http-middleware"></a>

Επιλύστε τον tenant από κάτι που εμπιστεύεται η εφαρμογή, όπως ένα επαληθευμένο token claim
ή ένα host name, και ελέγξτε το έναντι των γνωστών tenants. Ένα απλό client header παρουσιάζεται εδώ
μόνο για συντομία.

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { runWithTenant } from '@nestjs-pipeline/tenant';

const TENANTS = new Set(['tenant_a', 'tenant_b']);

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: IncomingMessage, _res: ServerResponse, next: () => void): void {
    const header = req.headers['x-tenant'];
    const tenant = typeof header === 'string' && TENANTS.has(header) ? header : undefined;
    runWithTenant(tenant, next);
  }
}
```

Δηλώστε το με `consumer.apply(TenantMiddleware).forRoutes('*')`.

### Queue job <a id="queue-job"></a>

```typescript
@Processor('reports')
export class ReportProcessor extends WorkerHost {
  async process(job: Job<{ tenantId: string; reportId: string }>) {
    await runWithTenant(job.data.tenantId, () =>
      this.commandBus.execute(new BuildReportCommand(job.data.reportId)),
    );
  }
}
```

Για να μεταφέρετε τον tenant, το correlation id και το principal του αιτήματος εισαγωγής στην ουρά, με
επικύρωση, χρησιμοποιήστε τα `withJobContext` και `@InJobContext` του
[`@nestjs-pipeline/job-context`](/nestjs-pipeline/packages/nestjs-pipeline/job-context/),
ρυθμισμένα με το `tenantSource`.

### Αλλαγή του tenant για τμήμα ενός handler <a id="changing-the-tenant-for-part-of-a-handler"></a>

```typescript
for (const tenant of ['tenant_a', 'tenant_b']) {
  await runWithTenant(tenant, () => this.commandBus.execute(new RecalculateCommand()));
}
```

### Ανάγνωση του tenant σε μια βιβλιοθήκη <a id="reading-the-tenant-in-a-library"></a>

```typescript
import { currentTenantId } from '@nestjs-pipeline/tenant';

function tenantKey(key: string): string {
  const tenant = currentTenantId();
  if (tenant === undefined) throw new Error('No tenant in scope.');
  return `${tenant}:${key}`;
}
```

Το πακέτο κατέχει το tenant store. Με ρυθμισμένο το `tenantSource`, ένα pipeline που ξεκινά
μέσα σε `runWithTenant` λαμβάνει αυτόν τον tenant ως write-once `context.tenantId` και εκτελεί τα
behaviors και τον handler του με αυτόν, οπότε εμφωλευμένες αποστολές τον κληρονομούν. Μια κλήση `runWithTenant` μέσα σε
έναν handler αλλάζει τον tenant μόνο για το δικό της callback, και ένα pipeline που αποστέλλεται εκεί λαμβάνει
τον νέο tenant. Το `runWithTenant(undefined, fn)` εκτελεί το `fn` χωρίς tenant. Έξω από οποιοδήποτε scope,
το `currentTenantId()` επιστρέφει `undefined`: κώδικας που απαιτεί tenant πρέπει τότε να αποτυγχάνει αντί
να υποχωρεί σε κοινόχρηστο tenant, όπως πράττουν τα tenant-scoped behaviors.

Για να παραδώσετε τον tenant σε μια βιβλιοθήκη που ζητά μια συνάρτηση επιστροφής του τρέχοντος tenant,
περάστε το ίδιο το `currentTenantId`.

## API <a id="api"></a>

| Export | Είδος | Περιγραφή |
| --- | --- | --- |
| `currentTenantId()` | συνάρτηση | Ο tenant της εσωτερικότερης εκτέλεσης pipeline ή `runWithTenant` scope, ή `undefined` |
| `runWithTenant(tenantId, fn)` | συνάρτηση | Εκτελεί το `fn` με `tenantId` ως τρέχοντα tenant και επιστρέφει το αποτέλεσμά του |
| `tenantSource` | αντικείμενο | `{ current, run }` πάνω από το ίδιο store, για `PipelineModule.forRoot({ sources })` και `JobContextModule.forRoot` |

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια χρήσης υπό την **AGPL-3.0-or-later** ή **Εμπορική Άδεια (Commercial License)**. Δείτε τα
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
στη ρίζα του repository.
