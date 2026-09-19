# Τελικός πίνακας εκκρεμοτήτων — `nestjs-pipeline`

Ενοποίηση όλων των ευρημάτων από τα έξι reviews του `docs/reviews/`, χωρίς τα ήδη
επιλυμένα (αυτά είναι διαγραμμένα στα αντίστοιχα αρχεία). Η σειρά είναι σειρά
εκτέλεσης: πρώτα ό,τι είναι ορθότητα ή ασφάλεια, μετά τα συμβόλαια, τέλος ο
καθαρισμός. Όπου μια εργασία εξαρτάται από προηγούμενη, σημειώνεται.

Επαλήθευση κατάστασης κώδικα: commit `6ef2d1e`.

**Πρόοδος:** Η Φάση Α ολοκληρώθηκε (1–13). Στη Φάση Β προηγούνται τα `packages/*`
(όλα έτοιμα: 17, 18, 19, 21, 22, 23) και ακολουθούν τα `ddd/*` (14, 15, 16,
20, 24, 25, 26). Κάθε αλλαγή συνοδεύεται από tests που αποδεδειγμένα πέφτουν
χωρίς τη διόρθωση, και όλο το `pnpm check`, `pnpm -r build`, `pnpm -r test`
περνούν.

Επιπλέον, μετά από παρατήρηση: αφαιρέθηκε κάθε κώδικας παραγωγής που υπήρχε μόνο
για τα tests (`PIPELINE_OPTIONS_REGISTRY`, εξαγωγές και παράμετροι-seams) και ο
κανόνας καταγράφηκε σε `AGENTS.md`, `SKILL.md` και `Intstractions.md` — commit
`1a98202`.

## Φάση Α — Ορθότητα και ασφάλεια — **ΟΛΟΚΛΗΡΩΘΗΚΕ**

| # | Εργασία | Τι είναι | Γιατί είναι bug / πρέπει να γίνει | Αναφορές | Commit |
|---|---|---|---|---|---|
| 1 | ~~Κλειδί cache χωρίς `correlationId`~~ | Το `defaultCacheKey` περιέχει το `correlationId`, που είναι μοναδικό ανά αίτημα | Το cache δεν κάνει ποτέ hit: γράφει σε κάθε query χωρίς να διαβάζει ποτέ. Και δεν είναι όριο ασφαλείας, γιατί ο client μπορεί να στείλει δικό του correlation ID | [Claude F-03](Claude.Review.md), [Packages F02](Packages.Full.Review.md) | `539eb16` |
| 2 | ~~Barriers vs write-through~~ | Το `isCacheNewer` επιστρέφει `false` για barrier, οπότε ένα write-through το σβήνει | Διαγραμμένη οντότητα ανασταίνεται στο cache. Οι barriers προστατεύουν μόνο τους readers, όχι τους writers | [Claude F-04](Claude.Review.md) | `b50dd99` |
| 3 | ~~`ttl: 0` σε barrier + `MemoryCache` χωρίς όριο~~ | `ttl <= 0` σημαίνει «ποτέ δεν λήγει» και το `Map` δεν έχει eviction | Κάθε διαγραφή αφήνει μόνιμο κλειδί — διαρροή μνήμης | [Claude F-04](Claude.Review.md) | `b50dd99` |
| 4 | ~~`CaslAuthorizer.authorize` overload~~ | Η κλήση `authorize('actor', 'read', entity)` ερμηνεύεται ως `(action, subject, fields)` | Σιωπηλά ελέγχει λάθος action/subject και αρνείται έγκυρη ενέργεια. Είναι primitive εξουσιοδότησης | [Claude F-02](Claude.Review.md), [Packages F20](Packages.Full.Review.md) | `f1bad58` |
| 5 | ~~`span.end()` μέσα σε `finally`~~ | Εξαίρεση από το instrumentation αντικαθιστά το επιχειρησιακό σφάλμα | Ο caller παίρνει `span end failure` αντί για το πραγματικό σφάλμα. Το ίδιο και με τον logger στα metrics | [Packages F03](Packages.Full.Review.md) | `561fab9` |
| 6 | ~~Idempotency: απελευθέρωση μετά από επιτυχία~~ | Αν αποτύχει η σειριοποίηση της απάντησης, το claim διαγράφεται | Οι παρενέργειες έχουν ήδη γίνει· το επόμενο retry τις επαναλαμβάνει αμέσως | [Packages F12](Packages.Full.Review.md) | `dd6f6b9` |
| 7 | ~~Rate-limit: συγκρούσεις κλειδιών~~ | Το join με `:` δεν κάνει escape· `includeTenant` σημαίνει «αν υπάρχει» | Δύο διαφορετικοί καλούντες μοιράζονται bucket· tenant παραλείπεται σιωπηλά | [Claude F-12](Claude.Review.md), [Packages F05](Packages.Full.Review.md) | `7cc8cf8` |
| 8 | ~~Rate-limit: καθολικό default bucket~~ | Χωρίς `keyFactory` το bucket είναι το `requestName` για όλους | Ένας κακόβουλος client κλειδώνει όλους τους χρήστες όλων των tenants | [Claude F-13](Claude.Review.md) | `7cc8cf8` |
| 9 | ~~Logging: `redactSensitiveKeys: false`~~ | Η απόκρυψη ευαίσθητων πεδίων είναι opt-in | Ενεργοποιώντας payload logging γράφονται passwords και tokens στα logs | [Claude F-14](Claude.Review.md), [Packages F11](Packages.Full.Review.md) | `c3a595e` |
| 10 | ~~Adapter αλλάζει ξένο store~~ | Ο `CacheManagerAdapter` θέτει `throwOnErrors = true` σε store του καλούντος | Αντιβαίνει στο τεκμηριωμένο συμβόλαιο ιδιοκτησίας· αλλάζει συμπεριφορά κοινόχρηστου store | [Packages F06](Packages.Full.Review.md) | `c3a595e` |
| 11 | ~~Bootstrap: λείπον provider ως scoping~~ | Το `catch` γύρω από `moduleRef.get()` θεωρεί κάθε αποτυχία θέμα scope | Λείπον behavior token περνά το bootstrap και σκάει στο πρώτο αίτημα | [Packages F09](Packages.Full.Review.md) | `334bf48` |
| 12 | ~~`getBehaviorId` με όνομα κλάσης~~ | Δύο άσχετες κλάσεις με ίδιο όνομα θεωρούνται μία | Ένα security guard μπορεί να εξαφανιστεί από dedup | [Packages F10](Packages.Full.Review.md) | `334bf48` |
| 13 | ~~Postgres idempotency: δύο ρολόγια~~ | `expires_at` από `Date.now()`, έλεγχος με SQL `now()` | Με clock skew ένα claim γεννιέται ήδη ληγμένο και άλλος το ξαναπαίρνει ενώ τρέχει ο πρώτος | [Packages F13](Packages.Full.Review.md) | `7afe3cc` |

## Φάση Β — Συμβόλαια και αρχιτεκτονική — **σε εξέλιξη** (τα `packages/*` ολοκληρώθηκαν· ολοκληρώθηκε (το 24 μερικώς))

| # | Εργασία | Τι είναι | Γιατί είναι bug / πρέπει να γίνει | Αναφορές | Commit |
|---|---|---|---|---|---|
| 14 | ~~Δημοσίευση events από το σχήμα επιστροφής~~ | Το `CommandBaseHandler` δημοσιεύει μόνο αν το αποτέλεσμα είναι `AggregateRoot` ή έχει `aggregate` | Handler που επιστρέφει DTO χάνει σιωπηλά όλα τα domain events. Κατά [Astra A-05](Astra.Review.md) δεν έγινε redesign σε wrapper: το `TResult` περιορίστηκε σε `AggregateBearingResult`, ώστε ο compiler να απορρίπτει handler που επιστρέφει DTO· το `commit()` σημάνθηκε deprecated | [Claude F-07](Claude.Review.md), [ChatGPT F-04](ChatGPT.Review.md), [Final 4](Final.Review.md), [Astra A-05](Astra.Review.md) | `1caea76` |
| 15 | ~~Δημόσια setters στο `RootEntity`~~ *(κατά [Astra](Astra.Review.md))* | `id`, `createdAt`, `updatedAt` έχουν public setters για το ORM | Οι setters υπάρχουν μόνο για το `accessor: true` του MikroORM και είναι τεκμηριωμένη απόφαση. Το [Astra](Astra.Review.md) συστήνει να διατηρηθούν για αυτό το sample και να προστεθεί **enforcement** ότι ο κώδικας εφαρμογής περνά από factories/domain methods — αυτό έγινε (`aggregate-identity.grit`). Η αφαίρεση των setters απαιτεί persistence records + mappers και έχει νόημα μόνο αν το sample στοχεύει σε αυστηρό encapsulation | [Claude F-11](Claude.Review.md), [Gemini 3](Gemini.Review.md), [Final 5](Final.Review.md) | `36c0343` |
| 16 | ~~`RootDomainEvent.entity` ζωντανό~~ | Το `payload` είναι παγωμένο, το `entity` δείχνει το ζωντανό aggregate | Async handler διαβάζει τρέχουσα κατάσταση αντί για την κατάσταση του event· μπορεί και να τη μεταλλάξει | [Gemini 4](Gemini.Review.md), [Final 6](Final.Review.md), [Astra A-06](Astra.Review.md) | `36c0343` |
| 17 | ~~Zod: `AbstractConstructor<T = any>`~~ | Χωρίς base class το instance γίνεται `any` | Χάνεται κάθε έλεγχος τύπου στην έξοδο· `request.nonexistentMethod()` περνά το strict TS | [Packages F04](Packages.Full.Review.md) | `5148c95` |
| 18 | ~~Zod: διπλό validation~~ | Ο constructor είναι σύγχρονος κατά σχεδίαση (τεκμηριωμένο)· δεν υπήρχε όμως κανένας τρόπος να κατασκευαστεί instance με async schema | Η τεκμηρίωση παρέπεμπε στο behavior/pipe, που όμως τρέχουν *μετά* την κατασκευή. Προστέθηκε `parseAsync()`· η σύγχρονη προεπιλογή διατηρείται όπως ζητά το [Astra A-08](Astra.Review.md) | [Claude F-18](Claude.Review.md), [Gemini 6](Gemini.Review.md), [Final 8](Final.Review.md), [Astra A-08](Astra.Review.md) | `b5decc9` |
| 19 | ~~Resilience: όνομα πρώτου request~~ | Το policy cache κρατά το `requestName` της πρώτης κλήσης | Handler για πολλά events αναφέρει πάντα το πρώτο· λάθος τηλεμετρία σε retry storm | [Claude F-08](Claude.Review.md), [Gemini 7](Gemini.Review.md), [Final 9](Final.Review.md), [Astra A-10](Astra.Review.md) | `5148c95` |
| 20 | ~~Audit μέσα σε retry~~ | Στο `DeleteUserHandler` το `AuditBehavior` είναι εσωτερικά του `ResilienceBehavior` | Ένα delete με δύο retries γράφει τρεις εγγραφές audit· και είναι το «θετικό παράδειγμα» που αντιγράφουν | [Claude F-09](Claude.Review.md) | `ec79c96` |
| 21 | ~~Feature flag: χαμένο decision σε `throw`~~ | Με `errorPolicy: 'throw'` δεν γράφεται ποτέ το `FEATURE_FLAG_DECISION_ITEM` | Ακριβώς στην πιο κρίσιμη περίπτωση το audit/telemetry δεν βλέπει τίποτα· χάνεται και το `cause` | [Packages F15](Packages.Full.Review.md) | `09f938b` |
| 22 | ~~Scoped dispatcher: «τελευταίος κερδίζει»~~ | Το fallback διαλέγει τον τελευταίο καταχωρημένο runner | Με δύο Nest apps στη διεργασία, αίτημα του A τρέχει την αλυσίδα του B | [Claude F-19](Claude.Review.md) | `09f938b` |
| 23 | ~~Σιωπηλό σβήσιμο global options~~ | Σκέτο `@UsePipeline(Behavior)` διαγράφει τα global options του behavior | Ο developer νομίζει ότι επιβεβαιώνει το behavior και του αφαιρεί τη ρύθμιση | [Claude F-20](Claude.Review.md) | `09f938b` |
| 24 | ~~`ddd-core`: ORM στο barrel~~ *(μερικώς)* | Ένα `index.ts` εξάγει domain, application και MikroORM μαζί· το ORM είναι runtime dependency | Όποιος εισάγει `DomainException` φορτώνει MikroORM· τα layers δεν υπάρχουν στο module system. **Έγινε:** ξεχωριστά entry points `/domain`, `/application`, `/persistence`· το `@mikro-orm/core` έγινε προαιρετικό peer· Grit κανόνας απαγορεύει το `/persistence` σε `cqrs/` και `domain/`· test αποδεικνύει ότι το `/domain` δεν φορτώνει MikroORM. **Εκκρεμεί:** μετακίνηση των υπαρχόντων imports από το root barrel στα layered entry points | [ChatGPT F-09](ChatGPT.Review.md), [Claude §7](Claude.Review.md), [Astra](Astra.Review.md) | `ae234ce` |
| 25 | ~~`OptimisticLockError` ως τύπος παρουσίασης~~ | Το `DomainExceptionFilter` πιάνει τύπο του `@mikro-orm/core` | Τύπος υποδομής ταξιδεύει ως το HTTP boundary· αλλαγή ORM αλλάζει το presentation | [Claude §7](Claude.Review.md) | `6ca17b7` |
| 26 | ~~`GetUserContextHandler` χωρίς εξουσιοδότηση~~ | Pass-through handler χωρίς `@UsePipeline`, επιστρέφει `CaslUserContext` | Όποιος στέλνει query παίρνει το authorization context οποιουδήποτε χρήστη | [Claude F-21](Claude.Review.md) | `ec79c96` |

## Φάση Γ — Καθαρισμός και τεκμηρίωση

| # | Εργασία | Τι είναι | Γιατί είναι bug / πρέπει να γίνει | Αναφορές | Commit |
|---|---|---|---|---|---|
| 27 | ~~`stableStringify` χάνει το `cause`~~ | Πιάνει ακριβή `TypeError` και πετά γενικό μήνυμα | Ο χειριστής δεν μαθαίνει ποιο πεδίο ή ποιος περιορισμός έσπασε | [Claude F-17](Claude.Review.md), [Gemini 9](Gemini.Review.md), [Astra A-12](Astra.Review.md) | `f9a40af` |
| 28 | ~~Deprecated aliases και legacy κλάδοι~~ | `markPersisted`, `createZodCommand`, `ZOD_SCHEMA`, `$kind`, `CaslEntityAuthorizer`, `RESILIENCE_ABORT_SIGNAL_ITEM`, `PIPELINE_OPTIONS_REGISTRY`, legacy backoff, `retry.isRetryable` | Συμβατότητα με εκδόσεις που δεν κυκλοφόρησαν ποτέ· το `isRetryable` επηρεάζει και circuit breaker και fallback, όχι μόνο retry | [Claude F-16](Claude.Review.md), [Astra A-11](Astra.Review.md), [Packages F19](Packages.Full.Review.md) | `5960779` |
| 29 | ~~`forRootAsync` αγνοεί ρυθμίσεις~~ | Το factory επιστρέφει πλήρη options αλλά τα provider-graph πεδία αγνοούνται σιωπηλά | Το εκτελέσιμο συμβόλαιο λέει ψέματα· μόνο το JSDoc το διορθώνει | [Packages F08](Packages.Full.Review.md) | `ff02e60` |
| 30 | ~~Διαγνωστικά φόρτωσης adapter~~ | Το `bindings file` θεωρείται «λείπει το πακέτο» | Ο χρήστης εγκαθιστά ξανά πακέτο που ήδη έχει, ενώ το πρόβλημα είναι native build | [Packages F07](Packages.Full.Review.md) | `f9a40af` |
| 31 | ~~Δύο μηχανισμοί correlation στο BullMQ~~ | `addCorrelationId(payload)` στη μία μέθοδο, cast σε `JobsOptions` στην άλλη | Ίδια ανησυχία, δύο υλοποιήσεις· η δεύτερη στηρίζεται σε ατεκμηρίωτη συμπεριφορά του BullMQ | [Claude §7](Claude.Review.md) | `53a9ab6` |
| 32 | ~~Νεκρό `ignoreErrors: [ZodValidationError]`~~ | Το Zod τρέχει έξω από το DeadLetter, οπότε δεν φτάνει ποτέ εκεί | Ρύθμιση που διαβάζεται ως δικλείδα ασφαλείας και δεν κάνει τίποτα | [Claude §9.3](Claude.Review.md) | `53a9ab6` |
| 33 | ~~`getUpdateFields()` με reflection~~ | Η επιφάνεια εξουσιοδότησης προκύπτει από `Object.keys(this)` | Νέο πεδίο στο schema αλλάζει σιωπηλά τι ελέγχεται σε field-level authorization | [Claude §9.6](Claude.Review.md) | `53a9ab6` |
| 34 | ~~Συμβατότητα Nest/CQRS 10~~ | Τα peers δήλωναν `^10 || ^11`, τα tests έτρεχαν μόνο 11 | Διαφημιζόταν συμβατότητα που δεν δοκιμαζόταν, πάνω σε private APIs. **Απόφαση χρήστη: αφαίρεση της υποστήριξης Nest 10**, όχι τεκμηρίωση matrix | [ChatGPT F-10](ChatGPT.Review.md), [Astra A-07](Astra.Review.md), [Packages F17](Packages.Full.Review.md) | `ae18799` |
| 35 | ~~Απόκλιση τεκμηρίωσης~~ | Canonical READMEs: `cache:v3`, required key και ownership, stable flag targeting, replay-safe retries, σωστά test scripts και snapshot/persistence contracts | Επαλήθευση: `7681558` (2026-09-19). Ιστορική σήμανση reviews, ενοποίηση production notes και links σε compiled DDD examples. Πέρασαν 13 configuration snippets και το cache-handler example, application build, core typecheck, τέσσερα package suites, lint και έλεγχος links | [Claude §7](Claude.Review.md), [ChatGPT F-11](ChatGPT.Review.md), [Final 11](Final.Review.md), [Packages F18](Packages.Full.Review.md), [Astra A-09](Astra.Review.md) | `7681558` — `docs: resolve documentation drift in review row 35` |
| 36a | Το `ddd/core` δεν κάνει typecheck τα specs | Το `lint` τρέχει `tsc -p tsconfig.build.json`, που εξαιρεί τα `*.spec.ts` | 17 υπαρκτά σφάλματα τύπων στα specs είναι αόρατα· ένα `@ts-expect-error` που σταμάτησε να ισχύει δεν θα γίνει ποτέ αντιληπτό | *βρέθηκε κατά την εργασία 14* | — |
| 36 | ~~Γέφυρα feature flags → telemetry~~ | Τα context items υπάρχουν αλλά κανείς δεν τα γράφει ως span attributes | Η τεκμηρίωση υπόσχεται διαγνωστικά που απαιτούν κώδικα της εφαρμογής | [Packages F16](Packages.Full.Review.md) | `17c6de9` |

## Επιφυλάξεις, ρίσκα και ανοιχτά σημεία αυτής της συνεδρίας

Ό,τι επισήμανα ενώ δούλευα, ώστε να μην μείνει μόνο στα commit messages.

### 1. Αλλαγές συμπεριφοράς που σπάνε υπάρχουσα χρήση

| Θέμα | Τι αλλάζει | Τι πρέπει να προσέξετε |
|---|---|---|
| `CacheBehavior` απαιτεί ρητό `key` | Δεν υπάρχει πια default κλειδί | Κάθε handler με `CacheBehavior` χρειάζεται `key`· αλλιώς `TypeError` στο πρώτο αίτημα |
| `RateLimitBehavior` απαιτεί ρητό `keyFactory` | Δεν υπάρχει πια default bucket | Ίδιο· ένα ρητό `(ctx) => ctx.requestName` επαναφέρει την παλιά συμπεριφορά |
| `filterCacheKey` fail-closed | `MissingTenantContextError` παντού, όχι μόνο σε production | Staging/CI/test που βασίζονταν στο fallback θα σπάσουν — σκόπιμα |
| `redactSensitiveKeys` → `true` | Τα payload logs αποκρύπτουν ευαίσθητα πεδία | Παρατηρήσιμη αλλαγή στα logs· snapshots ίσως χρειαστούν ενημέρωση |
| Κληρονομικότητα options στο `@UsePipeline` | Ο handler κληρονομεί τα global options και επικαλύπτει **ανά πεδίο** (`{ ...global, ...handler }`), αντί να αντικαθιστά ολόκληρο το αντικείμενο | Δύο αλλαγές. (α) Το σκέτο `@UsePipeline(Behavior)` κληρονομεί αντί να σβήνει. (β) Το `[Behavior, { x }]` διατηρεί πλέον τα υπόλοιπα global πεδία. Δεν υπάρχει πια opt-out token: το `[Behavior, {}]` δεν προσθέτει τίποτα. Η συγχώνευση είναι ενός επιπέδου — ονομάζοντας ένθετο αντικείμενο (π.χ. `retry`) το αντικαθιστάς ολόκληρο |
| `retry.isRetryable` καταργήθηκε | Δεν αναγνωρίζεται πια ως classifier | Ήταν διπλή παγίδα: ένα predicate με όνομα «retry» καθόριζε επίσης ποια σφάλματα ανοίγουν το circuit breaker και ποια καταπίνει το fallback. Πλέον μόνο το `handle`. Όποιος το χρησιμοποιούσε παίρνει `ResilienceConfigurationError` στο πρώτο αίτημα, όχι σιωπηλή αλλαγή |
| `TResult extends AggregateBearingResult` | Ο compiler απορρίπτει handler που επιστρέφει DTO | Όλοι οι υπάρχοντες handlers συμμορφώνονται ήδη |
| `ConcurrencyConflictError` | Αντικαθιστά το `OptimisticLockError` | Όποιος έπιανε τον τύπο του ORM πρέπει να αλλάξει |
| `getUpdateFields(mutableFields)` | Παίρνει πλέον υποχρεωτικά τη λίστα πεδίων αντί για `exclude` | Κάθε command με field-level authorization δηλώνει `static MUTABLE_FIELDS`. Χωρίς όρισμα ο compiler το απορρίπτει |
| Payload correlation στο BullMQ batch | Το `batch-update` job έχει πλέον `{ items, correlationId }` αντί για γυμνό array | Jobs που βρίσκονται ήδη στην ουρά κατά την αναβάθμιση έχουν το παλιό σχήμα. Αδειάστε την ουρά ή αναπτύξτε με τον worker σταματημένο |
| `forRootAsync` factory | Επιστρέφει `PipelineRuntimeOptions`, όχι `PipelineModuleOptions` | Τα `behaviors` και `loggerProvider` δηλώνονται στην ίδια την κλήση. Αν τα επιστρέψει το factory, `TypeError` στο bootstrap αντί για σιωπηλή απόρριψη |
| Κατάργηση υποστήριξης Nest 10 | Τα peers είναι πλέον `^11.0.0`· το shim για `AsyncContext` αφαιρέθηκε | Ρητή απόφαση του χρήστη. Το `@nestjs/cqrs` εκθέτει το `AsyncContext` μόνο από την 11, και χωρίς αυτό οι request-scoped/transient handlers δεν μοιράζονται context με τα behaviors |

### 2. Ημιτελή

| # | Τι λείπει |
|---|---|
| 24 | Τα υπάρχοντα imports παραμένουν στο root barrel του `ddd-core`. Ο κανόνας `/persistence` ισχύει, αλλά η μετακίνηση ~50 imports στα layered entry points εκκρεμεί. Δεν έβαλα advisory κανόνα γιατί 50 warnings που κανείς δεν διορθώνει εκπαιδεύουν να αγνοείται το output |
| 36a | 17 υπαρκτά σφάλματα τύπων στα specs του `ddd/core`, αόρατα επειδή το `lint` τρέχει το build config |

### 3. Σημεία όπου ακολούθησα το review αντί για τη δική μου εισήγηση

| # | Η δική μου πρόταση | Τι έγινε και γιατί |
|---|---|---|
| 15 | Αφαίρεση των public setters από το `RootEntity` | Το [Astra](Astra.Review.md) λέει να διατηρηθούν για αυτό το sample και να μπει enforcement. Το `ddd/users-api/README.md` τεκμηριώνει τη συμφωνία. Μπήκε το `aggregate-identity.grit` |
| 14 | `CommandOutcome<TPayload>` wrapper | Το [Astra A-05](Astra.Review.md) λέει να κρατηθεί το aggregate-return και να ενισχυθούν οι τύποι. Έγινε περιορισμός τύπου, χωρίς redesign |
| 18 | Validation μόνο στο behavior | Το [Astra A-08](Astra.Review.md) και το root README κρατούν τον σύγχρονο constructor. Προστέθηκε `parseAsync()` για το κενό που δεν κάλυπτε κανείς |
| 10 (Φάση Α) | Διαγραφή των log-only event handlers | Απόφασή σας: το `users-api` είναι showcase. Ο κανόνας αναφέρει σε `warn` |

### 4. Τι δεν έχει επαληθευτεί

- **Το e2e suite δεν έτρεξε.** 28 αρχεία `*.e2e-spec.ts` χρειάζονται Docker, Redis και PostgreSQL. Όλα τα συμπεράσματα εδώ στηρίζονται στο unit suite (1.640 tests) και σε ανάγνωση κώδικα. Ειδικά οι αλλαγές σε cache barriers (2, 3) και στο Postgres lease (13) αξίζουν e2e επαλήθευση πριν από release.
- **Καμία αλλαγή δεν δοκιμάστηκε σε Nest/CQRS 10**, που τα peers εξακολουθούν να διαφημίζουν (εργασία 34).

### 5. Ποιότητα των ίδιων των tests

Δύο φορές σε αυτή τη συνεδρία έγραψα assertion που περνούσε ανεξάρτητα από τη διόρθωση:

- ο έλεγχος `IsAny` γινόταν πάνω σε subclass, που έχει δικό του instance type ακόμη κι όταν η base είναι `any`·
- ο πρώτος έλεγχος για τη σειρά audit/retry δεν άγγιζε καθόλου τον πραγματικό κώδικα.

Και τα δύο εντοπίστηκαν μόνο επειδή επαναφέρω το σφάλμα και επιβεβαιώνω ότι το test πέφτει. Αυτό το βήμα δεν είναι προαιρετικό — χωρίς αυτό ένα πράσινο test δεν αποδεικνύει τίποτα. Το ίδιο ισχύει για το ήδη υπάρχον `cache-key.spec.ts`, που κατοχύρωνε ως σωστή τη συμπεριφορά «το cache δεν κάνει ποτέ hit».

### 6. Εκτός εύρους, με πρόθεση

Το transactional outbox και η διάσπαση του `ddd-core` σε τέσσερα πακέτα παραμένουν εκτός: απαιτούν ρητή απόφαση προϊόντος και ADR, όπως συμφωνούν και τα τρία προηγούμενα reviews.

## Εκτός εύρους — απαιτεί ρητή αρχιτεκτονική απόφαση

| Θέμα | Γιατί δεν εκτελείται εδώ | Αναφορές |
|---|---|---|
| Transactional outbox για durable delivery | Και τα τρία reviews συμφωνούν ότι είναι χωριστή απόφαση προϊόντος: θέλει schema, relay, ordering, retention και ADR. Το `AGENTS.md` κανόνας 10 το απαγορεύει ως αυτόματη παρενέργεια | [Gemini 10](Gemini.Review.md), [Astra](Astra.Review.md), [ChatGPT F-02](ChatGPT.Review.md) |
| Διάσπαση `ddd-core` σε τέσσερα πακέτα | Χωρίς απαίτηση ανεξάρτητης επαναχρησιμοποίησης το κόστος ξεπερνά την αξία. Η #24 κάνει το χρήσιμο μέρος με subpath exports | [ChatGPT F-09](ChatGPT.Review.md), [Astra](Astra.Review.md) |
