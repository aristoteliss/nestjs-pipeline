---
title: "@nestjs-pipeline/casl"
description: "CASL authorization behavior και entity authorizer για το @nestjs-pipeline/core"
editUrl: false
---

> **Από την έκδοση 0.5.0 αυτό το πακέτο συνεχίζει ως [`@cqrs-ddd/pipeline-casl`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-casl).** Ο κώδικας, τα issues και
> τα releases βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-casl/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/casl` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις (fixes).

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/casl.svg)](https://www.npmjs.com/package/@nestjs-pipeline/casl)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/casl.svg)](https://www.npmjs.com/package/@nestjs-pipeline/casl)

CASL authorization για το `@nestjs-pipeline/core`, σε δύο στάδια:

1. Το **`CaslBehavior`** ελέγχει απαιτήσεις σε επίπεδο τύπου (`read User`) πριν από τον handler,
   και πριν οποιοδήποτε behavior cache ή idempotency μπορέσει να κάνει short-circuit.
2. Ο **`CaslAuthorizer`** ελέγχει τη φορτωμένη οντότητα και τα πεδία της μέσα στον handler, και
   προβάλλει (projects) τις απαντήσεις στα πεδία που επιτρέπεται να διαβάσει ο καλών.

Η εφαρμογή σας παρέχει ένα port, το `ICaslPermissionSource`, το οποίο επιστρέφει τον καλούντα και
τους κανόνες του για κάθε εκτέλεση του pipeline. Η προέλευση των κανόνων (βάση δεδομένων, token,
configuration) αποτελεί απόφαση της εφαρμογής.

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-casl @cqrs-ddd/nestjs @cqrs-ddd/pipeline @casl/ability @nestjs/cqrs
```

Peers: `@casl/ability` `^7.0.0`, `@nestjs/common` `^12.1.0`, `@nestjs/core` `^12.1.0`. Node.js 22.12 ή νεότερο.

## Ρύθμιση <a id="setup"></a>

Υλοποιήστε το `ICaslPermissionSource` και δηλώστε τα `CaslBehavior` και `CaslAuthorizer` ως providers στο authorization module σας:

```typescript
import { Injectable, Module } from '@nestjs/common';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import {
  type CaslAuthorizationInput,
  CaslBehavior,
  CaslAuthorizer,
  type ICaslPermissionSource,
} from '@cqrs-ddd/pipeline-casl';

@Injectable()
export class AppPermissionSource implements ICaslPermissionSource {
  constructor(private readonly grants: GrantRepository) {}

  async load(): Promise<CaslAuthorizationInput | null> {
    const session = currentSession();
    if (!session) return null; // unauthenticated: every gated handler is denied
    return {
      principal: { id: session.userId, department: session.department },
      rules: await this.grants.rulesFor(session.userId),
    };
  }
}

@Module({
  providers: [
    AppPermissionSource,
    GrantRepository,
    {
      provide: CaslBehavior,
      inject: [AppPermissionSource],
      useFactory: (source: AppPermissionSource) => new CaslBehavior(source),
    },
    CaslAuthorizer,
  ],
  exports: [CaslBehavior, CaslAuthorizer],
})
export class AuthorizationModule {}
```

Στο root module σας:

```typescript
@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      // Ensures CaslBehavior is evaluated before cache/idempotency in strict mode
      diagnostics: 'strict',
    }),
    AuthorizationModule,
  ],
})
export class AppModule {}
```

Το `load()` λαμβάνει το pipeline context, επομένως ένα source μπορεί επίσης να διαβάσει τον καλούντα από το
ίδιο το αίτημα. Ένα source κατασκευασμένο με factory:

```ts
CaslModule.forRoot({
  imports: [AuthorizationModule],
  permissionSource: {
    useFactory: (grants: GrantRepository): ICaslPermissionSource => ({
      async load(context) {
        const session = (context.request as { sessionUser?: SessionUser }).sessionUser;
        if (!session) return null;
        return {
          principal: { id: session.id, tenantId: session.tenantId },
          rules: await grants.rulesFor(session.id),
        };
      },
    }),
    inject: [GrantRepository],
  },
});
```

Οι κανόνες μπορούν να συνδυάζουν αντικείμενα `Capability` και strings, και οι ρόλοι είναι απλώς κανόνες που το source
συνενώνει (concatenates)· οι κανόνες απόρριψης υπερισχύουν ανεξαρτήτως σειράς (δείτε [Προτεραιότητα κανόνων](#rule-precedence)):

```ts
const roles: Record<string, string[]> = {
  admin: ['all|manage|*'],
  author: ['Post|read|*', 'Post|create|*', 'Post|update|{"authorId":"${user.id}"}'],
};

async rulesFor(userId: string): Promise<Capability[]> {
  const { roleNames, extra, denied } = await this.store.grantsOf(userId);
  return [...roleNames.flatMap((name) => roles[name] ?? []), ...extra, ...denied]
    .map(normalizeCapability);
}
```

## Δήλωση απαιτήσεων <a id="declare-requirements"></a>

```ts
@QueryHandler(GetUserQuery)
@UsePipeline(requires({ action: 'read', subject: 'User' }))
export class GetUserHandler {}

@CommandHandler(UpdatePostCommand)
@UsePipeline(
  requires(
    { action: 'update', subject: 'Post', field: 'title' },
    { action: 'update', subject: 'Post', field: 'body' },
  ),
)
export class UpdatePostHandler {}
```

Το `requires(a, b, …)` επιστρέφει `[CaslBehavior, { rules }]`· κάθε απαίτηση πρέπει να ικανοποιείται επιτυχώς (AND).
Το behavior αποθηκεύει το κατασκευασμένο ability και τον principal στο `context.items`
(`CASL_ABILITY_KEY`, `CASL_PRINCIPAL_KEY`)· διαβάστε τα με τα `getCaslAbility()` και
`getCaslPrincipal()`. Ένας handler χωρίς απαιτήσεις εκτελείται χωρίς φόρτωση δικαιωμάτων.

## Έλεγχος οντοτήτων στον handler <a id="check-entities-in-the-handler"></a>

Ο `CaslAuthorizer` διαθέτει τέσσερις μεθόδους. Χρησιμοποιεί το ability που αποθήκευσε το `CaslBehavior` για την
τρέχουσα εκτέλεση, ή ένα ability που μεταβιβάστηκε στον constructor του (`new CaslAuthorizer(ability)`). Απουσία
ability σημαίνει απόρριψη (deny).

```ts
// Writes: throw unless the entity and every accepted field are permitted.
const user = await this.users.findById(command.id);
if (!user) throw new EntityNotFoundException('User', command.id);
this.authorizer.authorize('update', user, ['username', 'email']);
user.update(command.changes);

// Responses: authorize the entity, then return only readable candidate fields.
return this.authorizer.project('read', user, {
  id: user.id,
  username: user.username,
  email: user.email,
});

// Optional sections: a boolean check.
if (this.authorizer.can('read', user, 'email')) { /* … */ }

// Freshness: a conditional rule decides on entity attributes, so read the entity
// fresh rather than from a cache. True as well when no ability is present.
const refresh = this.authorizer.dependsOnEntity('read', 'User');
```

Ένας πλήρης handler, με συνθήκες tenant-scoped που αξιολογούνται έναντι της φορτωμένης οντότητας:

```ts
// Rule from the source: 'Project|update|{"tenantId":"${user.tenantId}"}|name,status'
@CommandHandler(UpdateProjectCommand)
@UsePipeline(requires({ action: 'update', subject: 'Project' }))
export class UpdateProjectHandler implements ICommandHandler<UpdateProjectCommand> {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(command: UpdateProjectCommand) {
    const project = await this.projects.findById(command.id);
    // Throws UnauthorizedActionException for a project of another tenant,
    // or when the command changes a field other than name or status.
    this.authorizer.authorize('update', project, command.changedFields);
    project.rename(command.name);
    await this.projects.save(project);
    return this.authorizer.project('read', project, project.toJSON());
  }
}
```

Ο τύπος subject είναι το όνομα κλάσης της οντότητας (`Project`). Για ένα απλό αντικείμενο, επισημάνετέ το με
το `subject()` του CASL: `this.authorizer.can('read', subject('Project', row))`.

Η `authorize` επιστρέφει `void`. Η `project` επιστρέφει `Projected<T>`: κάθε ιδιότητα μπορεί να
απουσιάζει, και τα στοιχεία πινάκων μπορεί να είναι `null`.

## Μορφή Capability <a id="capability-format"></a>

Οι κανόνες είναι αντικείμενα `Capability` ή συμπαγή strings:

```ts
{ subject: 'User', action: 'update',
  conditions: { department: '${user.department}' }, fields: ['username'] }

'User|update|{"department":"${user.department}"}|username'
'!User|delete|*'     // inverted (deny)
'all|manage|*'       // every action on every subject
'User|read|*|id,username|reason text'
```

- Μορφή string: `[!]subject|action[|conditions[|fields[|reason]]]`. Το `*` σημαίνει καθόλου
  συνθήκες ή όλα τα πεδία. Τμήματα που περιέχουν διαχωριστικό γράφονται ως `~` +
  base64url JSON, ώστε κάθε capability να διατηρείται ακέραιο μέσω των `serializeCapability` και
  `parseCapabilityString`· κακοδιατυπωμένα strings εγείρουν εξαίρεση.
- Το `all` αντιστοιχεί σε οποιοδήποτε subject και το `manage` σε οποιαδήποτε ενέργεια (λέξεις-κλειδιά CASL).
- Τα placeholders `${user.<path>}` (ή `${<path>}`, `{{ <path> }}`) επιλύονται έναντι του
  principal. Ένα placeholder που καταλαμβάνει ολόκληρο το string διατηρεί τον τύπο της τιμής. Ένα απόν attribute
  εγείρει εξαίρεση αντί να αντιστοιχίζεται σε κενή τιμή, όπως και ένα attribute που δεν είναι
  string, number, boolean, `null` ή πίνακας αυτών: ένα αντικείμενο διαφορετικά
  θα αξιολογούνταν ως τελεστές ερωτήματος (query operators).
- Ένας κανόνας επιτρεπόμενης πρόσβασης με `fields: []` εγείρει εξαίρεση: παραλείψτε το `fields` για όλα τα πεδία.

## Προτεραιότητα κανόνων (Rule precedence) <a id="rule-precedence"></a>

Το `buildAbility(rules, principal)` τοποθετεί κάθε άμεσο κανόνα πριν από κάθε αντεστραμμένο κανόνα (inverted rule),
σταθερά μέσα σε κάθε ομάδα. Επομένως, μια απόρριψη (deny) υπερισχύει έναντι μιας άδειας (allow) ανεξάρτητα από το ποιο
source συνεισέφερε το καθένα, π.χ. το `all|manage|*` από έναν ρόλο και το `!User|delete|*` από άρνηση χρήστη
απορρίπτουν το `delete User` σε οποιαδήποτε σειρά εισαγωγής.

## Προβολή (Projection) <a id="projection"></a>

- Μια διαδρομή γονέα (parent path) στην οποία έχει δοθεί άδεια εξουσιοδοτεί τους απογόνους της εκτός αν κάποιος απορρίπτεται ρητά:
  το `fields: ['profile']` επιτρέπει στην `project` να επιστρέψει το `profile.secret`, ενώ
  το `can('read', user, 'profile.secret')` είναι `false` (το CASL απαιτεί `profile.*`/`profile.**`).
  Συνεπώς, τα `can`/`authorize` και `project` εφαρμόζουν διαφορετικές πολιτικές πεδίων στην ίδια
  άδεια. Παρέχετε ένθετη πρόσβαση ως `profile.**` όταν ένας handler ελέγχει ένθετα πεδία και
  προβάλλει την ίδια απάντηση, ώστε να συμφωνούν και τα δύο:

  ```ts
  // fields: ['profile']    → project returns profile.secret; can(…, 'profile.secret') is false
  // fields: ['profile.**'] → project returns profile.secret; can(…, 'profile') and
  //                          can(…, 'profile.secret') are both true
  ```
- Ένα στοιχείο πίνακα που απορρίπτεται γίνεται `null`, ώστε οι θέσεις να παραμένουν σταθερές (`roles.0`).
- Οι ριζικοί πίνακες διατηρούν τη μορφή του πίνακα. Τα κατονομαζόμενα πεδία εφαρμόζονται σε κάθε στοιχείο· οι αριθμητικές
  διαδρομές περιορίζουν συγκεκριμένα στοιχεία (`0`, `0.id`). Οι ένθετοι πίνακες χρησιμοποιούν την ίδια κάλυψη μάσκας
  και ανίχνευση κύκλων με τις ιδιότητες ένθετων αντικειμένων. Ένα παρεχόμενο subject διέπει ολόκληρο
  το candidate αντικείμενο· εξουσιοδοτείτε συλλογές διακριτών οντοτήτων στοιχείο προς στοιχείο.
- Οι συνθήκες αξιολογούνται έναντι του **subject**, ποτέ έναντι του candidate, ώστε ένα response
  DTO να μην μπορεί να ικανοποιήσει μια συνθήκη που η οντότητα δεν ικανοποιεί.
- Κυκλική είσοδος και περισσότερα από 1024 ψευδώνυμα διαδρομών πινάκων εγείρουν εξαίρεση.

## Short-circuit behaviors <a id="short-circuit-behaviors"></a>

Ένα cache ή idempotency hit στο pipeline παρακάμπτει τον handler, και μαζί του τους ελέγχους οντότητας
και πεδίων του handler. Το `CaslBehavior` εξακολουθεί να εκτελείται πρώτο, αλλά ένας έλεγχος σε επίπεδο τύπου δεν
τους αναπαράγει.

- Οι **Response caches** χρησιμοποιούν ως κλειδί τα tenant + principal (`getCaslPrincipal()`) + σύνοψη των
  ενεργών κανόνων (`abilityDigest(context)`), και παρακάμπτουν την cache όταν συνθήκες οντότητας
  μπορούν να αλλάξουν το αποτέλεσμα (`hasEntityConditions(ability, subjects, action)`).
- Το **Idempotency** διατηρεί ένα **σταθερό operation key** (tenant + principal + λειτουργία, χωρίς
  δεδομένα δικαιωμάτων, ώστε μια αλλαγή δικαιωμάτων να μην μπορεί να εκτελέσει την παρενέργεια δύο φορές) και συνδέει την επανάληψη (replay)
  με μια **ξεχωριστή** fail-closed σύνοψη εξουσιοδότησης που συγκρίνεται πριν επιστραφεί οποιαδήποτε
  αποθηκευμένη απάντηση (`replayScopeFactory: requireAbilityDigest`). Μια απούσα ή αναντίστοιχη σύνοψη αρνείται το replay.

Το `abilityDigest(context?)` είναι το SHA-256 των κανόνων του ability στη σειρά, με τις συνθήκες
ήδη επιλυμένες έναντι του principal: ένας τροποποιημένος κανόνας, σειρά, λίστα πεδίων, αναστροφή ή
παρεμβαλλόμενη τιμή principal το αλλάζει. Προσδιορίζει δικαιώματα, όχι έναν καλούντα, επομένως
συνδυάστε το με τον principal σε οποιοδήποτε κλειδί πρέπει να διαχωρίζει καλούντες. Είναι `undefined`
όταν δεν υπάρχει ability· το `requireAbilityDigest(context?)` εγείρει `MissingAbilityError`
αντ' αυτού, ένα σφάλμα ρύθμισης που πρέπει να αντιστοιχίζεται σε server error, ποτέ σε 403.

## Λίστες <a id="lists"></a>

```ts
const visible = posts
  .filter((post) => this.authorizer.can('read', post))
  .map((post) => this.authorizer.project('read', post, post.toJSON()));
```

Η εξουσιοδότηση λίστας (`can` + `project` ανά στοιχείο) φιλτράρει μια ήδη φορτωμένη συλλογή στη
μνήμη. Δεν αποτελεί φιλτράρισμα βάσης δεδομένων: οι μετρήσεις σελιδοποίησης και τα μεγέθη σελίδας εξακολουθούν να αντικατοπτρίζουν
μη εξουσιοδοτημένες γραμμές. Η εξουσιοδοτημένη σελιδοποίηση απαιτεί σχεδιασμό στην πλευρά των queries.

## Σφάλματα <a id="errors"></a>

- Κάθε απόρριψη είναι ένα `UnauthorizedActionException` (`action`, `subject`, προαιρετικά
  `entityId` και `fields`). Το πακέτο δεν εγείρει transport εξαιρέσεις. Μέσω HTTP,
  δηλώστε το ενσωματωμένο `UnauthorizedActionFilter`. Το Nest κάνει inject το `HttpAdapterHost` του, και
  το φίλτρο απαντά μέσω αυτού του adapter (Express και Fastify, επίσης για σφάλμα που εγέρθηκε
  σε middleware):

  ```typescript
  @Module({
    providers: [{ provide: APP_FILTER, useClass: UnauthorizedActionFilter }],
  })
  export class AppModule {}
  ```

  Στο `main.ts`, περάστε τον host:
  `app.useGlobalFilters(new UnauthorizedActionFilter(app.get(HttpAdapterHost)))`.

  Απαντά με `403 Forbidden` και `statusCode`, `error`, `message`, `action` και
  `subject`. Το μήνυμα μπορεί να περιλαμβάνει το entity id και τα απορριφθέντα πεδία.
- Ένας μη ταυτοποιημένος καλών (το `load` επέστρεψε `null`) απορρίπτεται με αιτιολογία
  `Access denied — authentication required.`
- Αποτυχίες του permission source, κακοδιατυπωμένοι κανόνες και ανεπίλυτα placeholders διαδίδονται ως
  δικά τους σφάλματα, ποτέ ως αρνήσεις πρόσβασης.

## API <a id="api"></a>

| Export | Είδος |
| --- | --- |
| `CaslModule`, `CaslModuleOptions` | Δήλωση Module |
| `CaslBehavior`, `CaslBehaviorOptions`, `CASL_BEHAVIOR_ID` | Behavior σε επίπεδο τύπου |
| `requires` | Βοηθητικό δήλωσης `@UsePipeline` |
| `CaslAuthorizer` | `can`, `authorize`, `project`, `dependsOnEntity` |
| `getCaslAbility`, `getCaslPrincipal`, `hasEntityConditions`, `abilityDigest`, `requireAbilityDigest` | Βοηθητικά context εκτέλεσης και πολιτικής cache |
| `ICaslPermissionSource`, `CaslPrincipal`, `CaslAuthorizationInput`, `CASL_PERMISSION_SOURCE` | Application port |
| `buildAbility`, `interpolateConditions` | Κατασκευή ability |
| `parseCapabilityString`, `serializeCapability`, `normalizeCapability` | Κωδικοποιητής Capability |
| `Capability`, `CapabilityString`, `AbilityRequirement`, `AppAbility`, `AppRawRule`, `Projected` | Τύποι |
| `CASL_ABILITY_KEY`, `CASL_PRINCIPAL_KEY`, `CASL_ACTIONS`, `CASL_SUBJECTS`, `CaslAction`, `CaslSubject` | Σταθερές |
| `UnauthorizedActionException`, `UnauthorizedActionDetails` | Σφάλμα απόρριψης |
| `MissingAbilityError` | Απουσία ability όπου απαιτείται (σφάλμα ρύθμισης) |
| `UnauthorizedActionFilter` | Exception filter: απόρριψη → HTTP 403 |

## Μετάβαση από την έκδοση 0.1.x <a id="migrating-from-01x"></a>

Αυτά τα βήματα οδηγούν στην έκδοση 0.2.0. Για να φτάσετε στην 0.4.0, συνεχίστε με το [Αναβάθμιση από την 0.2.x](/nestjs-pipeline/upgrading/from-0-2/) και
το [Αναβάθμιση από την 0.3.x](/nestjs-pipeline/upgrading/from-0-3/) στο README του repository.

**1. Peers και runtime.** `@casl/ability` `^7.0.0` (ήταν `^6.0.0`), `@nestjs/common`
`^11.0.0` (ήταν `^10 || ^11`), `@nestjs-pipeline/core` `^0.2.0`, Node.js 22 ή νεότερο.

```bash
pnpm add @casl/ability@^7 @nestjs/common@^11 @nestjs-pipeline/core@^0.2.0 @nestjs-pipeline/casl@^0.2.0
```

**2. Ένα ενιαίο permission source αντικαθιστά τους providers και resolvers.** Οι επιλογές module
`roleProvider`, `userCapabilityProvider`, `userContextResolver`, `subjectContextPaths`
και `defaultFieldsFromRequest` καταργούνται, μαζί με τα `IRoleProvider`,
`IUserCapabilityProvider`, `IUserContextResolver`, `StaticRoleProvider`,
`RoleDefinition`, `UserCapabilities` και `CaslUserContext`. Η λειτουργία τους μεταφέρεται σε ένα
ενιαίο `ICaslPermissionSource.load()`, το οποίο επιστρέφει τον principal και τους ήδη αναπτυγμένους
κανόνες (κανόνες ρόλων, προσθήκες ανά χρήστη και αρνήσεις σε μία ενιαία λίστα).

```ts
// 0.1.x
CaslModule.forRoot({
  roleProvider: { useFactory: (pool: Pool) => new PgRoleProvider(pool), inject: [Pool] },
  userCapabilityProvider: PgUserCapabilityProvider,
  userContextResolver: JwtUserContextResolver,
  subjectContextPaths: ['sessionUser'],
  defaultFieldsFromRequest: { User: ['username', 'email'] },
});

// 0.2.0
@Injectable()
export class PgPermissionSource implements ICaslPermissionSource {
  constructor(private readonly roles: PgRoleProvider, private readonly users: PgUserCapabilityProvider) {}

  async load(context: IPipelineContext): Promise<CaslAuthorizationInput | null> {
    const user = (context.request as { sessionUser?: { id: string; tenantId: string } }).sessionUser;
    if (!user) return null;
    const grants = await this.users.getUserCapabilities(user);
    const roleRules = (await this.roles.getRoles(grants.roles)).flatMap((r) => r.capabilities);
    return {
      principal: user,
      rules: [...roleRules, ...grants.additionalCapabilities, ...grants.deniedCapabilities]
        .map(normalizeCapability),
    };
  }
}

CaslModule.forRoot({
  imports: [DatabaseModule],
  permissionSource: PgPermissionSource,
});
```

Τα παραπάνω `PgRoleProvider` και `PgUserCapabilityProvider` αποτελούν τις προηγούμενες υλοποιήσεις σας,
πλέον ως απλά application services.

**3. Principal αντί του `CASL_USER_CONTEXT_KEY`.** Ο ορισμός του χρήστη στο
`context.items` δεν διαβάζεται πλέον· επιστρέψτε τον ως `principal` από το `load()`. Το `principal.id`
είναι υποχρεωτικό. Τα placeholders επιλύονται έναντι αυτού (τα `${user.tenantId}`, `${tenantId}` και
`{{ tenantId }}` είναι ισοδύναμα).

```ts
// 0.1.x
context.items.set(CASL_USER_CONTEXT_KEY, { id: user.id, tenantId: user.tenantId });

// 0.2.0 — in load()
return { principal: { id: user.id, tenantId: user.tenantId }, rules };
```

**4. Το `requires()` αντικαθιστά το tuple (το tuple εξακολουθεί να λειτουργεί).**

```ts
// 0.1.x
@UsePipeline([CaslBehavior, { rules: [{ action: 'create', subject: 'Post' }] }])

// 0.2.0
@UsePipeline(requires({ action: 'create', subject: 'Post' }))
```

Το `rules` δεν πρέπει να είναι κενό. Η επιλογή `prebuiltAbility` καταργείται· για έλεγχο έναντι
ενός ability που κατασκευάσατε μόνοι σας, χρησιμοποιήστε το `new CaslAuthorizer(ability)`.

**5. Οι έλεγχοι οντοτήτων και πεδίων μεταφέρονται στον handler.** Τα `subjectFromRequest`,
`fieldsFromRequest`, και τα ανά handler `subjectContextPaths` και `defaultFieldsFromRequest`
καταργούνται. Η έκδοση 0.1.x αξιολογούσε συνθήκες έναντι του payload του command· η 0.2.0 τις αξιολογεί
έναντι της οντότητας που φορτώνει ο handler, χρησιμοποιώντας το `CaslAuthorizer`.

```ts
// 0.1.x
@UsePipeline([CaslBehavior, {
  subjectFromRequest: 'User',
  fieldsFromRequest: ['username', 'department'],
  rules: [{ action: 'update', subject: 'User' }],
}])

// 0.2.0
@UsePipeline(requires({ action: 'update', subject: 'User' }))
export class UpdateUserHandler {
  constructor(private readonly users: UserRepository, private readonly authorizer: CaslAuthorizer) {}

  async execute(command: UpdateUserCommand) {
    const user = await this.users.findById(command.id);
    this.authorizer.authorize('update', user, ['username', 'department']);
    // …
  }
}
```

Με το `@nestjs-pipeline/zod`, το `UpdateUserCommand.updatableFields` παρέχει τη λίστα των πεδίων.

**6. Το `skipCheck` καταργείται.** Για να προσαρμόσετε μια απάντηση χωρίς να θέσετε πύλη ελέγχου στον handler, δηλώστε
την ασθενέστερη απαίτηση και διαβάστε το ability:

```ts
// 0.1.x
@UsePipeline([CaslBehavior, { skipCheck: true }])
// … context.items.get(CASL_ABILITY_KEY)

// 0.2.0
@UsePipeline(requires({ action: 'read', subject: 'Post' }))
// … getCaslAbility()?.can('read', 'DraftPost'), or this.authorizer.can('read', 'DraftPost')
```

**7. Οι αρνήσεις είναι `UnauthorizedActionException`, όχι `ForbiddenException`.** Δηλώστε το
filter για να διατηρήσετε τις απαντήσεις HTTP 403:

```ts
{ provide: APP_FILTER, useClass: UnauthorizedActionFilter }
```

Κώδικας που συνέλαβε το `ForbiddenException` πρέπει να συλλαμβάνει το `UnauthorizedActionException`.

**8. Το `buildAbility` δέχεται rules, όχι roles.** Η υπογραφή του στην έκδοση 0.1.x ήταν
`buildAbility(roles, user, additional)`· τώρα είναι `buildAbility(rules, principal)`.
Τα `buildAbilityFromRules`, `capabilityToRawRule`, `capabilitiesToRawRules` και
`CASL_BEHAVIOR_LOGGER` καταργούνται.

```ts
// 0.1.x
const ability = buildAbility(roleDefinitions, user, extraCaps);
const same = buildAbilityFromRules(capabilitiesToRawRules(caps, user));

// 0.2.0
const ability = buildAbility(
  [...roleDefinitions.flatMap((role) => role.capabilities), ...extraCaps],
  principal,
);
```

**9. Αυστηρότεροι κανόνες.** Ένα ανεπίλυτο placeholder, ένα placeholder που επιλύεται σε αντικείμενο,
και ένας κανόνας αποδοχής με `fields: []` πλέον εγείρουν εξαίρεση. Οι άμεσοι κανόνες εφαρμόζονται πάντοτε πριν
από τους αντεστραμμένους, επομένως μια άρνηση (deny) υπερισχύει ανεξάρτητα από τη σειρά εισαγωγής.

## Άδεια χρήσης <a id="license"></a>

Δείτε τα [LICENSE](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [COMMERCIAL_LICENSE.txt](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt).
