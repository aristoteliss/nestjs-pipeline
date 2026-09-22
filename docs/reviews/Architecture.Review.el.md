# Αρχιτεκτονική αναθεώρηση — nestjs-pipeline

Ημερομηνία ελέγχου: 2026-09-23 · Κλάδος: `review`

## Σκοπός και μέθοδος

Έλεγχος των ευρημάτων σε κάθε workspace με έμφαση στα αρχιτεκτονικά προβλήματα και, δευτερευόντως,
στην ποιότητα κώδικα: επανάληψη της ίδιας λογικής σε πολλά σημεία, κώδικας παραγωγής που
υπάρχει μόνο για τα tests, «AI slop» (περιττά σχόλια, αφηγηματικό κείμενο, υπερβολική
αφαίρεση), παραβιάσεις των κανόνων του `AGENTS.md` και της skill αρχιτεκτονικής.

Βάση ελέγχου: καθαρό working tree στο commit
`f5ef9591249dbe59c39457d0d62f06d7e2128f13`. Εξετάστηκαν οι αναφερόμενες διαδρομές,
τα δημόσια contracts, οι callers και τα σχετικά tests μαζί με τη χρήση στο `ddd/users-api`.
Δεν πρόκειται για απόδειξη απουσίας άλλων ελαττωμάτων σε όλο τον κώδικα.

Διατηρούνται τα IDs και η δομή για αντιστοίχιση με το αρχικό review. Όπου ένα σημείο
περιγράφει υποστηριζόμενο συμβόλαιο, η καταγραφή το διευκρινίζει αντί να το χαρακτηρίζει
σφάλμα. Οι πίνακες μετρούν σημεία ελέγχου, όχι μόνο αποδεδειγμένες παραβιάσεις.
Οι προτάσεις δεν αποτελούν εγκεκριμένες αλλαγές αρχιτεκτονικής. Η απουσία τοπικού
consumer δεν αποδεικνύει test-only δημόσιο API, και ένας κοινός σκελετός δεν αρκεί
για να δικαιολογήσει νέα αφαίρεση ή εξάρτηση στον core.

Διασταύρωση με δεύτερο ανεξάρτητο review (branch `review2`, commit
`59a88a5076502cb5e8717813162017c091c6a135`, αρχείο `docs/reviews/Architecture.Review.merged.el.md`).
Ενσωματώθηκαν μόνο σημεία που επαληθεύτηκαν στον κώδικα ή με εκτέλεση. Όσα δεν
ενσωματώθηκαν καταγράφονται με αιτιολόγηση στην ενότητα 17.

Κάθε εύρημα σημειώνεται με μία από τις κατηγορίες του `AGENTS.md`:

- **Αναπαραγόμενο ελάττωμα** — επιβεβαιωμένο με εκτέλεση συγκεκριμένου σεναρίου.
- **Συμπέρασμα διαδρομής κώδικα** — προκύπτει από ανάγνωση της ροής, δεν εκτελέστηκε.
- **Κίνδυνος συμβολαίου** — το δημόσιο API υπόσχεται κάτι που δεν εγγυάται.
- **Αρχιτεκτονική πρόταση** — σχεδιαστική βελτίωση, όχι σφάλμα.

Σοβαρότητα: **Υψηλή** / **Μεσαία** / **Χαμηλή**.

## Σειρά αναθεώρησης

1. `packages/pipeline`
2. `packages/pipeline-correlation`
3. `packages/pipeline-casl`
4. `packages/pipeline-opentelemetry`
5. `packages/pipeline-zod`
6. `packages/pipeline-audit`
7. `packages/pipeline-cache`
8. `packages/pipeline-deadletter`
9. `packages/pipeline-feature-flags`
10. `packages/pipeline-idempotency`
11. `packages/pipeline-rate-limit`
12. `packages/pipeline-resilience`
13. `ddd/core`
14. `ddd/users-api`

---

## 1. `packages/pipeline` (`@nestjs-pipeline/core`)

**Ρόλος:** η μηχανή του pipeline. Εντοπίζει τους CQRS handlers, τους τυλίγει με την αλυσίδα
behaviors, μεταφέρει το context ανά αίτημα μέσω `AsyncLocalStorage` και εκθέτει κοινά
βοηθητικά (κλειδιά, stringify, redaction, uuidv7) στα υπόλοιπα πακέτα.

**Χρήση στο users-api:** `ddd/users-api/src/infrastructure/observability.module.ts`
(`PipelineModule.forRootAsync` με global behaviors, correlation και `tenantIdFactory`).

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/core test` → 20 αρχεία, 288 tests, όλα
περνούν. `pnpm --filter @nestjs-pipeline/core lint` → χωρίς σφάλματα.

**Συνολική εκτίμηση:** ο πυρήνας (plan → contracts → runner) είναι καλά διαχωρισμένος και η
σειρά της αλυσίδας τεκμηριώνεται με συνέπεια. Τα προβλήματα βρίσκονται κυρίως στο δημόσιο
API: εκθέτει εσωτερικό setter, έχει ένα αδήλωτο πρωτόκολλο που το χρησιμοποιούν πέντε
πακέτα και παρουσιάζει ασυνέπεια στα exclusions του sanitizer. Δευτερευόντως, υπάρχει πολύ
αφηγηματικό JSDoc.

### P-01 · Δημόσιο `SET_TENANT_ID` με εσωτερικό συμβόλαιο μεταβολής

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Το symbol εξάγεται από το public barrel, ενώ δηλώνεται `@internal` και
  προορίζεται για την αρχικοποίηση του tenant από τον runner. Ένα custom behavior μπορεί
  να αλλάξει tenant αφού έχει προηγηθεί άλλος έλεγχος. Αυτό είναι επικίνδυνη δημόσια
  δυνατότητα, όχι αποδεδειγμένο bypass από HTTP χρήστη: τα behaviors είναι έμπιστος κώδικας
  της εφαρμογής και η απόκρυψη ενός symbol δεν αποτελεί απομόνωση κακόβουλου κώδικα.
  Ο runner εισάγει το symbol από το εσωτερικό `constants/pipeline-context.constants.ts`,
  **όχι** από το public barrel. Οι μόνοι consumers της δημόσιας εξαγωγής στο αποθετήριο
  είναι δύο specs του users-api (`ddd/users-api/test/create-command-replay-scope.spec.ts`,
  `ddd/users-api/test/create-command-idempotency.spec.ts`). Αυτό δείχνει test-only χρήση
  του export, αλλά δεν αποκλείει εξωτερικούς consumers του δημοσιευμένου πακέτου.
- **Παράδειγμα:** `(context as PipelineContext)[SET_TENANT_ID]('other-tenant')` μέσα σε
  behavior αλλάζει τη διάσταση που θα χρησιμοποιήσει ένα επόμενο cache key factory.
- **Πού:** `packages/pipeline/src/index.ts`,
  `packages/pipeline/src/constants/pipeline-context.constants.ts`,
  `packages/pipeline/src/pipeline.context.ts`,
  `packages/pipeline/src/services/pipeline-runner.ts`.
- **Πρόταση:** Να αποσαφηνιστεί ποιος επιτρέπεται να θέτει tenant και σε ποια φάση.
  Τυχόν απόσυρση του export χρειάζεται έλεγχο δημοσιευμένου API και συμβατότητας.

### P-02 · Αδήλωτο πρωτόκολλο `resolveEffectiveOptions` με duck typing σε 5 πακέτα

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Κατά το bootstrap, το `validateBehaviorContracts` ελέγχει με type-casts αν
  το instance έχει μέθοδο `resolveEffectiveOptions` και την καλεί. Η μέθοδος δεν υπάρχει σε
  κανένα interface (`IPipelineBehavior`, `IPipelineBehaviorContract`). Παρ' όλα αυτά την
  υλοποιούν ανεξάρτητα τα cache, resilience, rate-limit, idempotency και feature-flags, το
  καθένα με τη δική του λογική συγχώνευσης options. Είναι το ίδιο μοτίβο γραμμένο πέντε φορές
  πάνω σε ένα άτυπο συμβόλαιο: αν αλλάξει η υπογραφή σε ένα πακέτο, ο compiler δεν ελέγχει το κοινό
  πρωτόκολλο· στο runtime μπορεί να προκύψει παράλειψη defaults, λάθος διάγνωση ή throw.
- **Παράδειγμα:**
  ```ts
  typeof (instance as unknown as { resolveEffectiveOptions?: unknown })
    .resolveEffectiveOptions === 'function'
    ? (instance as unknown as { resolveEffectiveOptions: (...) => ... })
        .resolveEffectiveOptions(rawMerged)
    : rawMerged;
  ```
- **Πού:** `packages/pipeline/src/services/pipeline-contracts.ts`· υλοποιήσεις στα
  `packages/pipeline-cache/src/cache.behavior.ts`, `packages/pipeline-resilience/src/resilience.behavior.ts`,
  `packages/pipeline-rate-limit/src/rate-limit.behavior.ts`,
  `packages/pipeline-idempotency/src/idempotency.behavior.ts`,
  `packages/pipeline-feature-flags/src/feature-flag.behavior.ts`.
- **Πρόταση:** Να οριστεί προαιρετικό interface για το **instance** και να το υλοποιούν
  τα behaviors. Ένα πεδίο μόνο στο static contract δεν τυποποιεί την τωρινή κλήση instance.
  Οι διαφορετικές πολιτικές συγχώνευσης παραμένουν ευθύνη του κάθε πακέτου.
- **Συμπλήρωμα (review2, επαληθεύτηκε):** για scoped/dynamic behaviors δεν υπάρχει instance
  στο bootstrap. Το `validate` λαμβάνει τότε τα raw handler/global options **χωρίς** τα module
  defaults που θα εφάρμοζε το `resolveEffectiveOptions`. Το JSDoc του
  `PipelineBehaviorValidationContext.effectiveOptions` το δηλώνει, αλλά ο ίδιος validator
  βλέπει διαφορετικά δεδομένα ανάλογα με το lifecycle του behavior.

### P-03 · Επανεξαγωγές redaction: κοινή υλοποίηση, ασαφής τεκμηρίωση ιδιοκτησίας

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Τα audit/deadletter επανεξάγουν τις ίδιες συναρτήσεις του core. Υπάρχει
  μία υλοποίηση, όχι τρεις πηγές αλήθειας. Οι επανεξαγωγές μπορούν να είναι σκόπιμη
  διευκόλυνση των consumers. Το συγκεκριμένο πρόβλημα είναι ότι το JSDoc του
  `DEFAULT_REDACT_KEYS` μιλά αποκλειστικά για audit και για συγχώνευση που γίνεται από
  τους callers, όχι από την ίδια τη σταθερά.
- **Παράδειγμα:** `redactValue` από audit και core παραπέμπει στο ίδιο helper· το
  `LoggingBehavior` χρησιμοποιεί επίσης τη λίστα χωρίς να δημιουργεί audit record.
- **Πού:** `packages/pipeline/src/helpers/safeStringify.ts`,
  `packages/pipeline-audit/src/helpers/redact.ts`,
  `packages/pipeline-audit/src/index.ts`, `packages/pipeline-deadletter/src/index.ts`.
- **Πρόταση:** Τεκμηρίωση της κοινής προέλευσης και γενικό JSDoc στον core. Όχι διαγραφή
  exports μόνο για να μειωθεί ο αριθμός import paths.

### P-04 · Η προεπιλεγμένη απόκρυψη αγνοεί συνηθισμένες παραλλαγές ονομάτων

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Το `DEFAULT_REDACT_KEYS` ελέγχει μόνο **ακριβές** όνομα κλειδιού, χωρίς
  διάκριση πεζών-κεφαλαίων. Κλειδιά όπως `refresh_token`, `api_key`, `clientSecret`,
  `passwordHash`, `sessionToken` και `x-api-key` περνούν αυτούσια στα logs, στα audit και στα
  dead-letter records. Επίσης το `excludeKeys` κάνει διάκριση πεζών-κεφαλαίων ενώ το
  `redactKeys` όχι: δύο παρόμοιες επιλογές συμπεριφέρονται διαφορετικά.
- **Αναπαραγωγή** (εκτελέστηκε):
  ```text
  safeStringify({refresh_token:'r1',api_key:'k',clientSecret:'s',passwordHash:'h',
                 sessionToken:'t',password:'p',headers:{'x-api-key':'xk'}},
                {redactKeys: DEFAULT_REDACT_KEYS})
  → {"refresh_token":"r1","api_key":"k","clientSecret":"s","passwordHash":"h",
     "sessionToken":"t","password":"[REDACTED]","headers":{"x-api-key":"xk"}}
  safeStringify({Password:'p'}, new Set(['password']))  → {"Password":"p"}
  ```
- **Πού:** `packages/pipeline/src/helpers/safeStringify.ts`.
- **Πρόταση:** Προσθήκη των απαιτούμενων aliases και σαφής πολιτική matching. Αφαίρεση
  `_`/`-` καλύπτει `refresh_token`, όχι `passwordHash` ή `clientSecret`. Η αλλαγή του
  `excludeKeys` σε case-insensitive χρειάζεται έλεγχο συμβατότητας. Δεν υπάρχει γενική
  εγγύηση ότι μια λίστα ονομάτων εντοπίζει κάθε μυστικό.

### P-05 · Όρια των extension points και δημόσιο escape hatch τύπων

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Ο runner κατασκευάζει συγκεκριμένο `PipelineContext`, ενώ το
  `BasePipelineContext` περιγράφεται ως επεκτάσιμο. Μια υποκλάση δεν εγκαθίσταται αυτόματα
  στον runner. Αυτό περιορίζει τη χρήση της επέκτασης, δεν αποδεικνύει ότι η βάση είναι
  άχρηστη: υποστηρίζει ανεξάρτητους consumers/custom runners. Αντίστοιχα το `'unknown'`
  μπορεί να αναπαριστά εξωτερικό context, παρότι το Nest discovery παράγει γνωστά είδη.
  Το δημόσιο `untyped()` προσθέτει index signature με τιμές `unknown`, **όχι** `any`.
  Η αξιολόγηση αφορά τα casts που ακολουθούν και όχι υποτιθέμενη κατάργηση όλων των ελέγχων τύπων.
- **Παράδειγμα:** `class CustomContext extends BasePipelineContext { ... }` δεν αλλάζει
  το `new PipelineContext(request, meta)` στο `createPipelineRunner`.
- **Πού:** `packages/pipeline/src/pipeline.context.ts`,
  `packages/pipeline/src/services/pipeline-runner.ts`,
  `packages/pipeline/src/types/safe-typing.ts`.
- **Πρόταση:** Να δηλωθεί το όριο επέκτασης και να περιοριστούν τα casts όπου υπάρχουν
  συγκεκριμένοι τύποι. Καμία αφαίρεση reusable API λόγω απουσίας τοπικού consumer.

### P-06 · Δύο τρόποι για τον logger και ασυμμετρία forRoot / forRootAsync

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `loggerProvider` επικυρώνεται ότι δεσμεύει το `LOGGING_BEHAVIOR_LOGGER`,
  με τον ίδιο έλεγχο αντιγραμμένο στα `forRoot` και `forRootAsync`. Το JSDoc του
  `extraProviders` όμως δείχνει ως παράδειγμα τη δέσμευση του **ίδιου** token μέσω
  `extraProviders`, που παρακάμπτει τον έλεγχο. Το `extraProviders` υπάρχει μόνο στο
  `forRootAsync`. Επιπλέον το `forRoot` είναι global μέσω του `@Global()`, ενώ τα
  `forRootAsync`/`forFeature` μέσω `global: true`. Τέλος, τα option types επανεξάγονται και
  από το `packages/pipeline/src/pipeline.module.ts` και από το `options/`, άρα υπάρχουν δύο διαδρομές εξαγωγής για
  τους ίδιους τύπους.
- **Παράδειγμα:** Το ίδιο `LOGGING_BEHAVIOR_LOGGER` μπορεί να δοθεί μέσω `loggerProvider` ή μέσω `extraProviders` στο async module, αλλά μόνο η πρώτη επιλογή έχει τον ειδικό έλεγχο token.
- **Πού:** `packages/pipeline/src/pipeline.module.ts`,
  `packages/pipeline/src/options/pipeline-module.options.ts`.

### P-07 · Εύθραυστη αναγνώριση scoped-provider σφάλματος

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `isScopedProviderError` αναγνωρίζει το Nest error από class name ή
  υποσυμβολοσειρά μηνύματος. Η συμβατότητα εξαρτάται από εσωτερική συμπεριφορά του Nest.
  Τα πρόσθετα throws `Expected singleton behavior at index … to be pre-resolved` και
  `Scoped pipeline method registry is missing` είναι **απρόσιτα εκ κατασκευής**: ο βρόχος
  resolution είτε κάνει `resolvedBehaviors.set(i, …)`, είτε `dynamicIndices.add(i)`, είτε
  ρίχνει. Το `methodMap` ορίζεται πάντα στον scoped κλάδο πριν χρησιμοποιηθεί. Στην πράξη
  εξυπηρετούν type narrowing (`Map.get` → `T | undefined`), όχι runtime προστασία. Δεν
  υπάρχουν για tests.
  Επιπλέον (review2, επαληθεύτηκε): πέρα από το τεκμηριωμένο `ExplorerService`, το bootstrap
  εισάγει το εσωτερικό `@nestjs/core/injector/instance-wrapper` και **αντικαθιστά** τις
  μεθόδους `getInstanceByContextId`/`setInstanceByContextId` πάνω στα `InstanceWrapper`
  των scoped handlers. Αυτή η σύζευξη με private Nest API δεν αναφέρεται στο αποδεκτό
  trade-off του `AGENTS.md` (κανόνας 9) ούτε στον χάρτη, που μιλούν μόνο για `ExplorerService`.
- **Παράδειγμα:** Άλλο όνομα και μήνυμα σφάλματος σε μελλοντική έκδοση Nest θα μπορούσε
  να ταξινομήσει ένα scoped provider ως αποτυχία registration.
- **Πού:** `packages/pipeline/src/services/pipeline.bootstrap.service.ts`.
- **Πρόταση:** Να καλύπτεται από τον υπάρχοντα έλεγχο συμβατότητας Nest/bootstrap. Τα
  απρόσιτα throws μπορούν να αντικατασταθούν από δομή που δεν χρειάζεται narrowing
  (π.χ. άμεση κατασκευή του πίνακα behaviors μέσα στον βρόχο resolution). Είναι
  απλοποίηση, όχι διόρθωση σφάλματος.

### P-08 · Αφηγηματικό JSDoc και σχόλια ιστορικού

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `AGENTS.md` απαγορεύει την περιττή αφήγηση και τα σχόλια ιστορικού·
  επιτρέπει σύντομη τεκμηρίωση μη προφανών τεχνικών περιορισμών.
  - Το `LoggingBehavior.handle` έχει JSDoc 45 γραμμών που περιγράφει βήμα-βήμα την υλοποίηση.
    Οι **ιδιωτικές** μέθοδοι `log`, `hasOptionalParams` και `extractOptionalParams` έχουν
    παράγραφο η καθεμιά («Type guard: true when…», «callers only reach this after…»).
    Υπάρχει και το σχόλιο `// Type definition accepting any error class`.
  - Στο `packages/pipeline/src/decorators/pipeline.decorator.spec.ts` υπάρχει σχόλιο ιστορικού: «The removed registry was
    keyed by class name…». Στο ίδιο αρχείο επίσης: «Keying on the name made two modules…».
  - Το `packages/pipeline/src/pipeline.module.async-contract.spec.ts` έχει τίτλο «keeps the **legacy** module shape».
  - Το `packages/pipeline/src/services/pipeline.bootstrap.regressions.spec.ts` είναι γενικό όνομα σουίτας· η λέξη
    `regressions` δεν είναι ticket ID ούτε από μόνη της παραβίαση. Πιο συγκεκριμένο όνομα
    είναι προαιρετική βελτίωση αναζήτησης.
- **Παράδειγμα:** Το σχόλιο «The removed registry was keyed by class name» εξηγεί ιστορικό αλλαγής αντί για το σημερινό invariant απομόνωσης metadata ανά handler.
- **Πού:** `packages/pipeline/src/behaviors/logging.behavior.ts`.

### P-09 · Διπλά tests και έλεγχος πολιτικής μονορεπό μέσα σε δημοσιευμένο πακέτο

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Στο `packages/pipeline/src/decorators/pipeline.decorator.spec.ts` τα tests «stores empty options map when no options are
    provided» και «records an empty option map when no options are present» ελέγχουν το ίδιο
    πράγμα. Το ίδιο ισχύει για τα «stores behavior options from tuple entries» και «records
    options on the handler that the bootstrap actually reads».
  - Το `packages/pipeline/src/package-boundaries.spec.ts` ελέγχει τα `package.json` **όλων** των αδελφών πακέτων.
    Είναι πολιτική του μονορεπό, αλλά βρίσκεται στο `src/` του πυρήνα. Ο τεκμηριωμένος λόγος
    (το GritQL δεν διαβάζει JSON) εξηγεί γιατί δεν είναι plugin, όχι γιατί ανήκει στον πυρήνα·
    ταιριάζει καλύτερα στο `integration/` ή στο `scripts/`.
- **Παράδειγμα:** Δύο tests εφαρμόζουν `@UsePipeline(BehaviorA)` χωρίς options και ελέγχουν `options.size === 0`, με διαφορετικό τίτλο αλλά ίδιο βασικό invariant.
- **Πού:** `packages/pipeline/src/decorators/pipeline.decorator.spec.ts`,
  `packages/pipeline/src/package-boundaries.spec.ts`.

### P-10 · Χρήση στο users-api: λανθασμένη τεκμηρίωση και σχόλια ιστορικού

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Το JSDoc του `ObservabilityModule` βρίσκεται πάνω από τη σταθερά `HTTP_LOG_REDACT_PATHS`,
    όχι πάνω από την κλάση.
  - Υπόσχεται ότι «Production environments can configure `LOG_LEVEL=warn`». Η μεταβλητή
    `LOG_LEVEL` δεν διαβάζεται πουθενά: το επίπεδο καθορίζεται μόνο από το `NODE_ENV`
    (επιβεβαιώθηκε με grep).
  - Απαριθμεί τα behaviors με σειρά διαφορετική από την πραγματική και με διαφημιστικό τόνο
    («for Prometheus / OTel collectors»).
  - Οι γραμμές 106-111 είναι σχόλιο ιστορικού: «Repeating ZodValidationError here read as a
    safety net that was doing nothing».
- **Παράδειγμα:** `LOG_LEVEL=warn` δεν αλλάζει το `pinoHttp.level`, το οποίο προκύπτει από `NODE_ENV === 'production' ? 'info' : 'debug'`.
- **Πού:** `ddd/users-api/src/infrastructure/observability.module.ts`.

### P-11 · Το `excludeKeys` δεν εφαρμόζεται σε custom ιδιότητες `Error` στο clone mode

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Ο γενικός object κλάδος του sanitizer ελέγχει `isExcluded`, ενώ ο
  κλάδος `Error` σε `mode: 'clone'` ελέγχει μόνο redaction. Η ίδια δηλωμένη εξαίρεση
  έχει διαφορετικό αποτέλεσμα ανάλογα με τον τύπο του container.
- **Αναπαραγωγή** (εκτελέστηκε):
  ```ts
  const error = Object.assign(new Error('failure'), { password: 'example' });
  const copy = safeSanitize(error, { mode: 'clone', excludeKeys: ['password'] });
  // Το copy εξακολουθεί να έχει password: 'example'.
  ```
- **Πού:** `packages/pipeline/src/helpers/safeStringify.ts` (κλάδος `Error`),
  `packages/pipeline/src/helpers/safeStringify.ts` (γενικός object κλάδος).
- **Πρόταση:** Ίδια πολιτική exclusions στις υποστηριζόμενες enumerable ιδιότητες.
  Το παράδειγμα αφορά το δημόσιο `safeSanitize` contract, όχι αποδεδειγμένη διαρροή
  από το users-api ούτε τη χωριστή συμπεριφορά του `redactKeys`.

### P-12 · Scoped handler εκτελείται χωρίς pipeline όταν δύο εφαρμογές μοιράζονται το prototype

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα (κίνδυνος συμβολαίου) · **Σοβαρότητα:** Μεσαία
- **Προέλευση:** review2, επαληθεύτηκε με εκτέλεση.
- **Περιγραφή:** Για scoped handlers το pipeline αντικαθιστά τη μέθοδο στο **prototype**. Αν
  δύο εφαρμογές στην ίδια διεργασία έχουν runner για το ίδιο prototype και ένα instance δεν
  είναι καταχωρισμένο σε καμία από τις δύο (δημιουργήθηκε εκτός των patched Nest context paths),
  ο dispatcher γράφει `warn` και καλεί την **αρχική** μέθοδο. Όλα τα behaviors παρακάμπτονται,
  μαζί και τα security/audit/idempotency. Η συμπεριφορά είναι fail-open, ενώ με μία εφαρμογή το
  ίδιο instance περνά κανονικά από το pipeline.
- **Αναπαραγωγή** (εκτελέστηκε με προσωρινό spec, που αφαιρέθηκε μετά): behavior που πάντα
  απορρίπτει. Με **δύο** `PipelineBootstrapService` το `new Handler().execute({})` επιστρέφει
  `'handler ran'` με WARN «execute() ran without its pipeline: 2 applications share this handler
  prototype…». Με **μία** το ίδιο call απορρίπτεται από το behavior.
- **Πού:** `packages/pipeline/src/services/pipeline.bootstrap.service.ts` (`pipelinedDispatcher`).
- **Πρόταση:** Fail-closed στην περίπτωση που δεν βρεθεί μοναδικός runner (throw αντί για
  fallback), ή ρητή τεκμηρίωση ότι η υποστήριξη πολλών εφαρμογών ανά διεργασία δεν ισχύει
  για instances εκτός Nest DI.

### Σύνοψη `packages/pipeline`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| P-01 | Δημόσιο `SET_TENANT_ID` με εσωτερικό συμβόλαιο μεταβολής | Κίνδυνος συμβολαίου | Μεσαία |
| P-02 | Αδήλωτο πρωτόκολλο `resolveEffectiveOptions` με duck typing σε 5 πακέτα | Αρχιτεκτονική πρόταση | Μεσαία |
| P-03 | Επανεξαγωγές redaction: κοινή υλοποίηση, ασαφής τεκμηρίωση ιδιοκτησίας | Αρχιτεκτονική πρόταση | Χαμηλή |
| P-04 | Η προεπιλεγμένη απόκρυψη αγνοεί συνηθισμένες παραλλαγές ονομάτων | Αναπαραγόμενο ελάττωμα | Μεσαία |
| P-05 | Όρια των extension points και δημόσιο escape hatch τύπων | Αρχιτεκτονική πρόταση | Χαμηλή |
| P-06 | Δύο τρόποι για τον logger και ασυμμετρία forRoot / forRootAsync | Αρχιτεκτονική πρόταση | Χαμηλή |
| P-07 | Εύθραυστη αναγνώριση scoped-provider σφάλματος | Κίνδυνος συμβολαίου | Χαμηλή |
| P-08 | Αφηγηματικό JSDoc και σχόλια ιστορικού | Αρχιτεκτονική πρόταση | Χαμηλή |
| P-09 | Διπλά tests και έλεγχος πολιτικής μονορεπό μέσα σε δημοσιευμένο πακέτο | Αρχιτεκτονική πρόταση | Χαμηλή |
| P-10 | Χρήση στο users-api: λανθασμένη τεκμηρίωση και σχόλια ιστορικού | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| P-11 | Το `excludeKeys` δεν εφαρμόζεται σε custom ιδιότητες `Error` στο clone mode | Αναπαραγόμενο ελάττωμα | Μεσαία |
| P-12 | Scoped handler χωρίς pipeline όταν δύο εφαρμογές μοιράζονται το prototype | Αναπαραγόμενο ελάττωμα | Μεσαία |

---

## 2. `packages/pipeline-correlation` (`@nestjs-pipeline/correlation`)

**Ρόλος:** μεταφέρει το correlation ID από HTTP header, ουρές μηνυμάτων και cron προς το
pipeline, μέσω ενός δεύτερου `AsyncLocalStorage` (`correlationStore`). Περιλαμβάνει
middleware, decorator `@WithCorrelation` και βοηθητικά για τον παραγωγό μηνυμάτων
(`addCorrelationId`, `correlationHeaders`).

**Χρήση στο users-api:** `ddd/users-api/src/app.module.ts` (middleware σε όλα τα routes),
`ddd/users-api/src/infrastructure/observability.module.ts` (γέφυρα με τον πυρήνα),
`ddd/users-api/src/users/jobs/bullmq-user-event-dispatcher.adapter.ts`,
`ddd/users-api/src/users/jobs/send-welcome-email.processor.ts`, `ddd/users-api/src/users/jobs/batch-update-users.processor.ts`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/correlation test` → 82 tests, όλα περνούν.

**Συνολική εκτίμηση:** μικρό και χρήσιμο πακέτο. Έχει όμως αντίγραφα βοηθητικών του πυρήνα,
fallback hook χωρίς τοπικό caller και προεπιλογές που χρειάζονται ρητή σκλήρυνση
σε δημόσιο HTTP. Η δημιουργία ID εκτός context είναι τεκμηριωμένη συμπεριφορά.

### C-01 · Δύο πηγές αλήθειας για το correlation ID

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Το correlation ID ζει σε δύο ανεξάρτητα `AsyncLocalStorage`: στο
  `pipelineStore` του πυρήνα (πεδίο `context.correlationId`) και στο `correlationStore` αυτού
  του πακέτου. Συγχρονίζονται μόνο αν η εφαρμογή δηλώσει **και** `correlationIdFactory`
  **και** `correlationIdRunner`. Αν ξεχάσει το δεύτερο, το `getCorrelationId()` μέσα σε
  handler επιστρέφει άλλη τιμή από το `context.correlationId`, χωρίς κανένα σφάλμα. Η
  σύνδεση είναι σωστή στο users-api, αλλά για τους εξωτερικούς καταναλωτές είναι παγίδα.
- **Παράδειγμα:** Custom `correlationIdFactory: () => 'pipeline-id'` χωρίς runner δεν εγκαθιστά το ίδιο ID στο ανεξάρτητο `correlationStore`.
- **Πού:** `packages/pipeline-correlation/src/correlation.store.ts`,
  `packages/pipeline/src/constants/pipeline-context.constants.ts`,
  `packages/pipeline/src/services/pipeline-runner.ts`.
- **Πρόταση:** Ένα `CorrelationModule`/preset που ορίζει και τα δύο μαζί, ή bootstrap
  diagnostic όταν έχει δηλωθεί μόνο το ένα από τα δύο.

### C-02 · Παραγωγή νέου correlation ID εκτός context: τεκμηριωμένη προεπιλογή

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `getCorrelationId()` παράγει νέο UUID σε κάθε κλήση όταν δεν υπάρχει
  ενεργό context. Αυτό αναφέρεται ρητά στο JSDoc και δεν είναι παραβίαση της υπογραφής.
  Η παγίδα είναι η υπόθεση ότι διαδοχικές κλήσεις εγκαθιστούν αυτόματα κοινό context.
- **Αναπαραγωγή** (εκτελέστηκε): `getCorrelationId() === getCorrelationId()` → `false`
  εκτός store. Μέσα σε `runWithCorrelationId(id, callback)` οι κλήσεις μοιράζονται το ID.
- **Πού:** `packages/pipeline-correlation/src/correlation.store.ts`.
- **Πρόταση:** Χρήση `runWithCorrelationId` στα entry points. Για προαιρετική ανάγνωση
  υπάρχει ήδη `correlationStore.getStore()`· δεν απαιτείται νέο API για την ίδια πράξη.

### C-03 · Εσωτερικό fallback registration χωρίς τοπικό καλούντα

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `setCorrelationFallback` είναι `@internal`, δεν εξάγεται από το
  barrel και δεν καλείται στον τοπικό κώδικα. Η μεταβλητή όμως διαβάζεται στην παραγωγή
  από `getCorrelationId()`. Άρα δεν είναι κατάσταση που παρατηρούν μόνο tests ούτε
  αποδεδειγμένη παραβίαση του κανόνα 20. Είναι ανενεργό τοπικά extension hook, με
  τεκμηρίωση που δημιουργεί προσδοκία διαθέσιμου registration API.
- **Παράδειγμα:** Ένας consumer του public barrel μπορεί να καλέσει `getCorrelationId`,
  αλλά δεν μπορεί από το ίδιο barrel να καταχωρίσει το fallback που περιγράφει το JSDoc.
- **Πού:** `packages/pipeline-correlation/src/correlation.store.ts`,
  `packages/pipeline-correlation/src/index.ts`.
- **Πρόταση:** Να αποσαφηνιστεί αν υποστηρίζεται registration από εξωτερικούς consumers.
  Απόσυρση μόνο μετά από έλεγχο υποστηριζόμενων deep imports και συμβατότητας.

### C-04 · Αντίγραφο `untyped()` και δυναμικές αλυσίδες με casts

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Το `packages/pipeline-correlation/src/types/safe-typing.ts` αντιγράφει **αυτούσιο** το `untyped()` του πυρήνα, μαζί με το
    ίδιο JSDoc «Before/After».
  - Το `dyn()`/`DynResult` είναι αναδρομικός callable τύπος με index signature. Επιτρέπει
    αυθαίρετες αλυσίδες κλήσεων με cast χωρίς να αποδεικνύει ότι οι ιδιότητες υπάρχουν.
    Δεν είναι κυριολεκτικά `any`, ούτε το `untyped()` επιστρέφει `any`: εκεί οι
    δυναμικές ιδιότητες έχουν τύπο `unknown`. Τα presets `CorrelationFrom.amqp/kafka/nats/grpc`
    στηρίζονται σε αυτές τις αλυσίδες `dyn(...)`. Ενσωματώνουν συμβάσεις τεσσάρων transports
    χωρίς κανέναν τύπο ή peer contract που να τις ελέγχει στο compile time (review2).
  - Το `packages/pipeline-correlation/src/helpers/uuidv7.ts` είναι αρχείο που κάνει μόνο re-export του `uuidv7` του πυρήνα, και
    το `packages/pipeline-correlation/src/index.ts` το ξαναεξάγει. Έτσι το `uuidv7` είναι δημόσιο API σε δύο πακέτα.
- **Παράδειγμα:** Αλλαγή της υπογραφής `untyped<T>` στον core δεν ενημερώνει το αντίγραφο στο correlation· το UUID helper αντιθέτως επανεξάγεται και μοιράζεται την υλοποίηση.
- **Πού:** `packages/pipeline-correlation/src/types/safe-typing.ts`,
  `packages/pipeline-correlation/src/helpers/uuidv7.ts`, `packages/pipeline-correlation/src/index.ts`.

### C-05 · Μη ασφαλής προεπιλογή: το client ελέγχει το ID χωρίς όριο μήκους

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Με τις προεπιλογές, κάθε μη κενή τιμή του header γίνεται δεκτή αυτούσια
  (`acceptIncoming: true`, χωρίς `maxLength` και χωρίς validator). Επιστρέφεται στο response
  header και μπαίνει σε κάθε γραμμή log, στα audit records, στα dead letters και στα
  BullMQ payloads. Η σκλήρυνση είναι opt-in. Το users-api δεν δεσμεύει `CORRELATION_OPTIONS`,
  άρα τρέχει με τις μη ασφαλείς προεπιλογές, παρότι είναι δημόσιο HTTP API. Δεν αποτελεί
  όριο εξουσιοδότησης (σωστά, κανόνας 5), αλλά επιτρέπει log flooding και νόθευση της
  ιχνηλάτησης.
- **Παράδειγμα:** `curl -H "x-correlation-id: $(head -c 8000 /dev/zero | tr '\0' a)" …` →
  8 KB επαναλαμβάνονται σε κάθε log του αιτήματος.
- **Πού:** `packages/pipeline-correlation/src/middlewares/http-correlation.middleware.ts`,
  `ddd/users-api/src/app.module.ts`.
- **Πρόταση:** Προεπιλεγμένο `maxLength` (π.χ. 128) και σύνολο επιτρεπτών χαρακτήρων στο
  πακέτο, ή τουλάχιστον ρητή ρύθμιση στο users-api.

### C-06 · Επιλογές και τύποι που οδηγούν σε casts ή δεν κάνουν τίποτα

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Το `header?: string | false` δέχεται `false`, το οποίο «does not disable middleware». Το
    ίδιο το JSDoc το δικαιολογεί «for compatibility» και «the current middleware
    implementation». Είναι τεκμηριωμένο alias της προεπιλογής, αλλά μπορεί να παρερμηνευθεί
    ως απενεργοποίηση. Τυχόν απόσυρσή του χρειάζεται συμβατότητα.
  - Το `CorrelationExtractor = (...args: unknown[]) => …` δεν δέχεται extractor με
    τυποποιημένες παραμέτρους. Γι' αυτό το users-api αναγκάζεται σε cast:
    ```ts
    @WithCorrelation({
      extract: (job: Job, _token: string) => job.data.correlationId,
    } as CorrelationDecoratorOptions)
    ```
    Ο άλλος processor, για το ίδιο πεδίο, γράφει `{ path: 'data.correlationId' }`, που είναι
    ήδη η προεπιλογή. Είναι δύο διαφορετικοί τρόποι για το ίδιο πράγμα μέσα στο ίδιο feature.
  - Το `@WithCorrelation` κάνει και logging σε κάθε κλήση: δημιουργεί `new Logger` ανά κλήση μόνο αν δεν υπάρχει configured/instance logger,
    το μήνυμα έχει emoji `🔗`, και χρησιμοποιεί σιωπηλά την ιδιότητα `this.logger` της κλάσης
    με duck typing. Αυτό είναι ευθύνη logging μέσα σε πακέτο συσχέτισης.
- **Παράδειγμα:** `{ header: false }` χρησιμοποιεί το default header αντί να απενεργοποιεί το middleware. Το logging του decorator απενεργοποιείται με `logLevel: 'none'`.
- **Πού:** `packages/pipeline-correlation/src/options/correlation.options.ts`,
  `packages/pipeline-correlation/src/decorators/with-correlation.decorator.ts`,
  `ddd/users-api/src/users/jobs/send-welcome-email.processor.ts`,
  `ddd/users-api/src/users/jobs/batch-update-users.processor.ts`.

### C-07 · Σχόλια ιστορικού στη χρήση του users-api

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `BullMqUserEventDispatcher` εξηγεί τι έκανε **παλιότερα** η ουρά: «The
  batch queue used to put it on `JobsOptions` instead…». Αυτό είναι ιστορικό αλλαγής, που
  ανήκει στο git.
- **Παράδειγμα:** «The batch queue used to put it on JobsOptions instead» είναι ιστορικό· το ενεργό contract είναι ότι το correlation ID ταξιδεύει στο job payload.
- **Πού:** `ddd/users-api/src/users/jobs/bullmq-user-event-dispatcher.adapter.ts`.

### Σύνοψη `packages/pipeline-correlation`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| C-01 | Δύο πηγές αλήθειας για το correlation ID | Αρχιτεκτονική πρόταση | Μεσαία |
| C-02 | Παραγωγή νέου correlation ID εκτός context: τεκμηριωμένη προεπιλογή | Κίνδυνος συμβολαίου | Χαμηλή |
| C-03 | Εσωτερικό fallback registration χωρίς τοπικό καλούντα | Αρχιτεκτονική πρόταση | Χαμηλή |
| C-04 | Αντίγραφο `untyped()` και δυναμικές αλυσίδες με casts | Αρχιτεκτονική πρόταση | Χαμηλή |
| C-05 | Μη ασφαλής προεπιλογή: το client ελέγχει το ID χωρίς όριο μήκους | Κίνδυνος συμβολαίου | Μεσαία |
| C-06 | Επιλογές και τύποι που οδηγούν σε casts ή δεν κάνουν τίποτα | Κίνδυνος συμβολαίου | Χαμηλή |
| C-07 | Σχόλια ιστορικού στη χρήση του users-api | Αρχιτεκτονική πρόταση | Χαμηλή |

---

## 3. `packages/pipeline-casl` (`@nestjs-pipeline/casl`)

**Ρόλος:** εξουσιοδότηση. Το `CaslBehavior` κάνει τον έλεγχο σε επίπεδο τύπου πριν από τον
handler (`requires(...)`). Το `CaslAuthorizer` κάνει τους ελέγχους σε επίπεδο οντότητας και
πεδίου μέσα στον handler (`authorize`, `project`, `can`). Υπάρχει επίσης σειριοποίηση
capabilities σε compact string και προβολή πεδίων (field projection).

**Χρήση στο users-api:** `ddd/users-api/src/auths/persistence/casl-permission.source.ts` (υλοποίηση του
port), `ddd/users-api/src/common/constants/casl.constants.ts`, όλοι οι handlers στα `users/` και `roles/`,
`ddd/users-api/src/users/cqrs/queries/get-user-overview.handler.ts`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/casl test` → 174 tests, όλα περνούν.

**Συνολική εκτίμηση:** το πιο προσεγμένο πακέτο ως τώρα. Έχει καθαρό port
(`ICaslPermissionSource`), κλείνει ασφαλώς όταν λείπει ability ή placeholder, και η σειρά
«όλα τα allow πριν από όλα τα deny» υλοποιεί την επιλεγμένη πολιτική. Χρειάζεται προσοχή
στην παρεμβολή τιμών και στη χρήση string subjects. Ο constructor με ability είναι
τεκμηριωμένο δημόσιο API· η διάκριση projection/field checks είναι σκόπιμο contract.

### A-01 · Η παρεμβολή placeholder επιτρέπει εισαγωγή τελεστών Mongo

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Όταν μια συνθήκη αποτελείται **μόνο** από ένα placeholder
  (`'${user.department}'`), η τιμή του principal μπαίνει **με τον αρχικό της τύπο**, για να
  μείνει αριθμός ένα αριθμητικό id. Αν το χαρακτηριστικό του principal είναι αντικείμενο,
  μπαίνει στη συνθήκη ως τελεστής Mongo. Μια συνθήκη «μόνο το δικό μου τμήμα» γίνεται τότε
  «οποιοδήποτε τμήμα». Στο users-api το `department` έρχεται από τη βάση ή από υπογεγραμμένο
  token, οπότε δεν είναι άμεσα εκμεταλλεύσιμο. Για τη δημοσιευμένη βιβλιοθήκη όμως, όπου τα
  χαρακτηριστικά μπορεί να προέρχονται από claims τρίτου IdP, είναι κενό ασφαλείας.
- **Αναπαραγωγή** (εκτελέστηκε):
  ```ts
  const a = buildAbility(
    [{ subject: 'User', action: 'read', conditions: { department: '${user.department}' } }],
    { id: 'u1', department: { $ne: '__none__' } },
  );
  a.can('read', subject('User', { department: 'finance' })); // → true
  ```
- **Πού:** `packages/pipeline-casl/src/helpers/ability.ts`.
- **Πρόταση:** Να επιτρέπονται μόνο scalar τιμές (string/number/boolean/null) ή πίνακες
  από scalars, και να απορρίπτεται κάθε αντικείμενο.

### A-02 · Ρητή ability στον constructor: υποστηριζόμενο δημόσιο API

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `CaslAuthorizer(ability?)` τεκμηριώνεται ρητά στο README και στο JSDoc:
  χρησιμοποιεί τη δοσμένη ability, αλλιώς το ambient pipeline context. Η χρήση με όρισμα
  μόνο από τοπικά specs δεν αποδεικνύει ότι προστέθηκε για tests. Είναι αξιοποιήσιμο και
  έξω από Nest/pipeline. Το `useFactory` αποφεύγει injection ενός TypeScript-only τύπου
  και υποστηρίζει αυτό το συμβόλαιο· δεν είναι από μόνο του ελάττωμα.
- **Παράδειγμα:** `new CaslAuthorizer(buildAbility(rules, principal))` επιτρέπει
  εξουσιοδότηση σε worker ή script που δεν έχει ενεργό `pipelineStore`.
- **Πού:** `packages/pipeline-casl/src/helpers/authorizer.ts`,
  `packages/pipeline-casl/README.md`, `packages/pipeline-casl/src/casl.module.ts`.
- **Πρόταση:** Διατήρηση του API. Τα integration tests του pipeline πρέπει να ελέγχουν
  και την ambient διαδρομή, όχι αποκλειστικά constructor injection.

### A-03 · Δύο σημασίες για το «επιτρέπεται πεδίο» (`can` vs `project`)

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Με grant `fields: ['profile']`, το `project` επιστρέφει το
  `profile.secret`, ενώ το `can('read', subject, 'profile.secret')` επιστρέφει `false`. Η
  διαφορά είναι γνωστή και καταγράφεται ως «gotcha» στο codebase map. Είναι όμως ασυνέπεια
  του ίδιου δημόσιου αντικειμένου: ένας handler που ελέγχει με `can` και απαντά με `project`
  εφαρμόζει δύο διαφορετικές πολιτικές. Το README και το JSDoc δηλώνουν ρητά αυτή τη διαφορετική σημασία: projection
  κληρονομεί parent grants, ενώ `can` διατηρεί το CASL field matching. Είναι κίνδυνος
  λανθασμένης χρήσης, όχι απόδειξη παράβασης της επιλεγμένης πολιτικής.
- **Παράδειγμα:** Grant `fields: ['profile']` επιτρέπει στο projection απογόνους του `profile`, ενώ `can('read', entity, 'profile.secret')` χρειάζεται κατάλληλο CASL field pattern.
- **Πού:** `packages/pipeline-casl/src/helpers/projection.ts`,
  `.claude/codebase-map.md` (Gotchas, «Field projection inherits parent grants»).
- **Πρόταση:** Σαφή παραδείγματα `profile` έναντι `profile.*` σε checks και projection.
  Ενοποίηση μόνο ως ξεχωριστή αρχιτεκτονική πρόταση με ανάλυση συμβατότητας.

### A-04 · Εξουσιοδότηση με βάση το όνομα της κλάσης και τον string subject

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Ο τύπος subject ενός αντικειμένου προκύπτει από το `constructor.name`. Με minification
    ή με δύο κλάσεις ίδιου ονόματος από διαφορετικά bounded contexts, οι κανόνες
    εφαρμόζονται σε λάθος τύπο.
  - Τα `authorize`, `project` και `can` δέχονται και `string` subject. Με string, το CASL
    αγνοεί τις συνθήκες. Επομένως ένας κανόνας «διάβασε μόνο το τμήμα σου» **περνά** τον
    έλεγχο: αναπαράχθηκε το `buildAbility([{…conditions:{department:'eng'}}]).can('read','User')
    → true`. Αυτό είναι σωστό για έλεγχο τύπου, αλλά το `project('read', 'User', candidate)`
    προβάλλει ολόκληρο το candidate όταν το grant δεν περιορίζει πεδία, χωρίς να
    ελέγξει τις συνθήκες πάνω στο candidate. Το field filtering εξακολουθεί να εφαρμόζεται.
- **Παράδειγμα:** Με conditional grant `{ department: 'eng' }`, το `project('read', 'User', { department: 'finance' })` επιστρέφει το candidate. Αναπαράχθηκε με string subject, όχι με φορτωμένο entity.
- **Πού:** `packages/pipeline-casl/src/helpers/authorizer.ts`.
- **Πρόταση:** Να περνά πραγματικό entity ή `subject(type, entity)` όταν απαιτείται
  entity check. Η αφαίρεση string subjects θα έσπαζε υποστηριζόμενο type-level API·
  πιθανό strict entity API αξιολογείται ξεχωριστά. Δεν αναπαράχθηκε HTTP bypass στο users-api.

### A-05 · Χρήση στο users-api: explicit request scope και ονοματοδοσία actions

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Το `CaslPermissionSource` είναι `Scope.REQUEST`, χωρίς άμεση εξάρτηση από το
    Nest REQUEST token: διαβάζει τον χρήστη από το `AsyncLocalStorage` (`getSessionUserFromStore()`) και
    αγνοεί το `context`. Λόγω του scope bubbling, το `CaslBehavior` γίνεται request-scoped και
    το pipeline το επιλύει με `moduleRef.resolve()` σε **κάθε** προστατευμένο αίτημα.
  - Υπάρχουν τρεις τρόποι γραφής των actions: `APP_ACTIONS.READ`, `'read'` και
    `APP_ACTIONS = CASL_ACTIONS` ως ψευδώνυμο. Συχνά εμφανίζονται μέσα στο **ίδιο αρχείο**
    (`ddd/users-api/src/users/cqrs/queries/get-user-overview.handler.ts`, `ddd/users-api/src/users/cqrs/commands/update-user.handler.ts`).
  - Στο `GetUserOverviewHandler`, το πρώιμο `authorize(READ, user)` αποτρέπει
    ανάγνωση permissions/roles για μη εξουσιοδοτημένο user. Το τελικό `project` κάνει
    επιπλέον field filtering. Παρότι επαναλαμβάνει τον entity check, η πρώτη κλήση έχει
    διακριτό σκοπό και δεν προτείνεται αφαίρεσή της ως «διπλοτυπία».
- **Παράδειγμα:** Ο overview handler απορρίπτει μη αναγνώσιμο user πριν καλέσει `readablePermissions`, και εφαρμόζει field projection στο τελικό σύνθετο αποτέλεσμα.
- **Πού:** `ddd/users-api/src/auths/persistence/casl-permission.source.ts`,
  `ddd/users-api/src/common/constants/casl.constants.ts`,
  `ddd/users-api/src/users/cqrs/queries/get-user-overview.handler.ts`.

### A-06 · Η σειρά CASL → cache/idempotency δεν απαιτεί την παρουσία του CASL

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Προέλευση:** review2, επαληθεύτηκε στον κώδικα.
- **Περιγραφή:** Τα `CacheBehavior` και `IdempotencyBehavior` δηλώνουν `after: CaslBehavior`.
  Ο κανόνας όμως είναι **σχετικής θέσης**: αν το `CaslBehavior` λείπει από την αλυσίδα, δεν
  παράγεται διάγνωση (τεκμηριώνεται στο `PipelineBehaviorOrderRule`). Η προστασία ενός
  short-circuit απέναντι στους entity/field ελέγχους εξαρτάται τελικά από το key factory.
  Στο users-api ο κίνδυνος μετριάζεται, γιατί τα partitioned keys διαβάζουν τον principal
  από το CASL context και αποτυγχάνουν ασφαλώς όταν αυτός λείπει.
- **Παράδειγμα:** Query με `cache({ key: (ctx) => 'users' })` χωρίς `requires(...)` περνά το
  bootstrap. Ένα cache hit επιστρέφει την ίδια απόκριση σε κάθε caller.
- **Πού:** `packages/pipeline-cache/src/cache.behavior.ts` (contract `order`),
  `packages/pipeline-idempotency/src/idempotency.behavior.ts` (contract `order`),
  `packages/pipeline/src/interfaces/pipeline-behavior-contract.interface.ts`.
- **Πρόταση:** Προαιρετικό `validate` που προειδοποιεί όταν ένα short-circuit behavior
  τρέχει χωρίς CASL και με key που δεν προέρχεται από partitioned factory.

### Σύνοψη `packages/pipeline-casl`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| A-01 | Η παρεμβολή placeholder επιτρέπει εισαγωγή τελεστών Mongo | Αναπαραγόμενο ελάττωμα | Μεσαία |
| A-02 | Ρητή ability στον constructor: υποστηριζόμενο δημόσιο API | Αρχιτεκτονική πρόταση | Χαμηλή |
| A-03 | Δύο σημασίες για το «επιτρέπεται πεδίο» (`can` vs `project`) | Κίνδυνος συμβολαίου | Μεσαία |
| A-04 | Εξουσιοδότηση με βάση το όνομα της κλάσης και τον string subject | Κίνδυνος συμβολαίου | Χαμηλή |
| A-05 | Χρήση στο users-api: explicit request scope και ονοματοδοσία actions | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| A-06 | Η σειρά CASL → cache/idempotency δεν απαιτεί την παρουσία του CASL | Κίνδυνος συμβολαίου | Χαμηλή |

---

## 4. `packages/pipeline-opentelemetry` (`@nestjs-pipeline/opentelemetry`)

**Ρόλος:** το `TraceBehavior` (span ανά handler) και το `MetricsBehavior` (histogram
διάρκειας, counter κλήσεων, counter ενεργών κλήσεων), μαζί με βοηθητικά για attributes
(`addPipelineTelemetryAttributes`, `buildTraceAttributes`).

**Χρήση στο users-api:** `ddd/users-api/src/infrastructure/observability.module.ts` (global),
`ddd/users-api/src/infrastructure/behaviors/telemetry-bridge.behavior.ts`, `ddd/users-api/src/tracing.ts`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/opentelemetry test` → 61 tests, όλα περνούν.

**Συνολική εκτίμηση:** σωστή αρχή («η τηλεμετρία δεν αλλάζει ποτέ το αποτέλεσμα») και
προσεγμένο `runOnce`, ώστε ο handler να μην εκτελεστεί δεύτερη φορά. Ο κώδικας όμως έχει
πολλά σχόλια ιστορικού, JSDoc σε λάθος σημείο, και διπλά βοηθητικά. Το πιο σοβαρό βρίσκεται
στη χρήση: το `ddd/users-api/src/tracing.ts` εγκαθιστά signal listeners χωρίς κλείσιμο της εφαρμογής.
Οι μετρικές ρυθμίζονται και από το SDK/environment· η απουσία explicit reader δεν
αποδεικνύει απουσία exporter.

### O-01 · Σχόλια ιστορικού και υπερβολική τεκμηρίωση μηχανισμών

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Ο κώδικας περιγράφει τι έκανε παλιότερα και τι «δεν κάνει πια», που είναι
  ακριβώς αυτό που απαγορεύει το `AGENTS.md`:
  ```ts
  // a throw here previously fell into the catch below and was re-thrown as
  // though the handler itself had failed.
  // span.end() in an unguarded finally replaced the business error
  // with the instrumentation error.
  ```
  - Στο JSDoc του `MetricsBehavior`: «The optional shared Nest logger constructor is
    **retained for compatibility**».
  - Και τα δύο behaviors εξηγούν σε παραγράφους ότι «deliberately does not inspect
    `constructor.name`, `ProxyTracerProvider.getDelegate()`, `NoopTracer`…». Είναι
    περιγραφή μιας υλοποίησης που αφαιρέθηκε.
- **Παράδειγμα:** «a throw here previously fell into the catch below» περιγράφει παλιά ροή· αρκεί να δηλώνεται ότι αποτυχία instrumentation δεν αντικαθιστά business error.
- **Πού:** `packages/pipeline-opentelemetry/src/trace.behavior.ts`,
  `packages/pipeline-opentelemetry/src/metrics.behavior.ts`.

### O-02 · Το JSDoc του `MetricsBehavior` είναι κολλημένο σε άλλη συνάρτηση

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το JSDoc της κλάσης (πριν από τη `logSafely`) ακολουθείται αμέσως από δεύτερο JSDoc και
  τη συνάρτηση `logSafely`. Έτσι η τεκμηρίωση της κλάσης δεν εμφανίζεται στο IDE ούτε στο
  `.d.ts` για το `MetricsBehavior`, και η `logSafely` έχει δύο μπλοκ τεκμηρίωσης.
- **Παράδειγμα:** Στο αρχείο το JSDoc της κλάσης ακολουθείται από `logSafely`, οπότε δεν είναι άμεσα συνδεδεμένο με το declaration του `MetricsBehavior`.
- **Πού:** `packages/pipeline-opentelemetry/src/metrics.behavior.ts`.

### O-03 · Παρόμοια instrumentation guards με διαφορετικά συμβόλαια

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Τα `logSafely`, `safely` και `LoggingBehavior.observe` περιέχουν παρόμοια
  try/catch για fail-open instrumentation. Η ομοιότητα δεν αρκεί για νέο κοινό abstraction:
  πρέπει να διατηρηθεί η διαφορά συγχρονικών/ασύγχρονων callbacks και επιχειρησιακών errors.
  Το optional chaining αφορά και runtime adapters/JavaScript consumers, άρα δεν
  χαρακτηρίζεται «αδύνατη περίπτωση» μόνο επειδή η TypeScript δηλώνει τη μέθοδο.
- **Παράδειγμα:** Logger που ρίχνει error δεν πρέπει να αντικαταστήσει το αποτέλεσμα του
  handler. Αντίστοιχα ένα αποτυχημένο `span.end()` δεν πρέπει να κρύψει το business error.
  Τα `outcome` και `pipeline.outcome` είναι δύο attributes της ίδιας μέτρησης, όχι δύο
  εκπομπές της μέτρησης.
- **Πού:** `packages/pipeline-opentelemetry/src/metrics.behavior.ts`,
  `packages/pipeline-opentelemetry/src/trace.behavior.ts`,
  `packages/pipeline/src/behaviors/logging.behavior.ts`.
- **Πρόταση:** Ενοποίηση μόνο όπου αποδεικνύεται ίδιο συμβόλαιο και πραγματική μείωση
  συντήρησης. Διατήρηση των ελέγχων fail-open.

### O-04 · Τα context items των πακέτων δεν χρησιμοποιούν τα typed tokens του πυρήνα

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Ο πυρήνας προσφέρει typed tokens (`createPipelineItem`,
  `requirePipelineItem`), ακριβώς για να μοιράζονται δεδομένα τα behaviors. **Κανένα** από τα
  11 αδελφά πακέτα δεν τα χρησιμοποιεί. Τα συγκεκριμένα items cache/audit/deadletter/feature-flags/idempotency/rate-limit
  χρησιμοποιούν `Symbol()`, ενώ CASL και το telemetry attributes bag χρησιμοποιούν
  `Symbol.for()`. Γι' αυτό ο καταναλωτής πρέπει να ξέρει το εσωτερικό σχήμα
  κάθε item και να κάνει cast. Το `TelemetryBridgeBehavior` του users-api το δείχνει καθαρά:
  ```ts
  const result = context.items.get(RATE_LIMIT_ITEM) as
    | { remainingPoints?: number } | undefined;
  const decision = context.items.get(FEATURE_FLAG_DECISION_ITEM) as
    | FeatureFlagDecision | undefined;
  ```
  Επιπλέον, αφού τα symbols δεν είναι `Symbol.for`, δύο αντίγραφα ενός πακέτου στο
  `node_modules` δεν βλέπουν το ίδιο item. Αυτό ακριβώς προσπαθεί να αποκλείσει το
  `packages/pipeline/src/package-boundaries.spec.ts` για τον πυρήνα.
  Η ευρύτερη συνέπεια (review2): το `context.items` λειτουργεί ως ambient data bus ανάμεσα
  σε CASL, cache, idempotency, feature flags και telemetry. Έτσι η σειρά των behaviors γίνεται
  και **συμβόλαιο δεδομένων** (ποιος γράφει πριν διαβάσει ποιος), όχι μόνο σειρά εκτέλεσης.
  Τα typed tokens θα έκαναν ορατό τουλάχιστον το σχήμα αυτού του συμβολαίου.
- **Παράδειγμα:** `createPipelineItem<FeatureFlagDecision>('feature decision', FEATURE_FLAG_DECISION_ITEM)` μπορεί να προσθέσει typing χωρίς αλλαγή του υπάρχοντος map key.
- **Πού:** `packages/pipeline-cache/src/cache.behavior.ts`,
  `packages/pipeline-deadletter/src/dead-letter.behavior.ts`,
  `packages/pipeline-feature-flags/src/feature-flag.behavior.ts`,
  `packages/pipeline-idempotency/src/idempotency.behavior.ts`,
  `packages/pipeline-rate-limit/src/rate-limit.behavior.ts`,
  `ddd/users-api/src/infrastructure/behaviors/telemetry-bridge.behavior.ts`.
- **Πρόταση:** Προσθήκη typed token wrappers **πάνω στα υπάρχοντα symbols**, διατηρώντας
  exports και raw `Map` interoperability. Τα types και το `Symbol.for` λύνουν διαφορετικά
  προβλήματα· νέο symbol θα έσπαγε τη συμβατότητα readers/writers.

### O-05 · users-api: οι μετρικές εξαρτώνται από την αυτόματη ρύθμιση του NodeSDK

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Η απουσία `metricReader` στο `ddd/users-api/src/tracing.ts` **δεν** αποδεικνύει no-op
  instruments. Η εγκατεστημένη έκδοση του `@opentelemetry/sdk-node` καλεί
  `getMetricReadersFromEnv()`, επιλέγει `otlp` όταν δεν δηλώνεται exporter και καταχωρίζει
  `MeterProvider` στο `start()`. Η επιτυχής παράδοση σε collector δεν ελέγχθηκε.
- **Παράδειγμα:** `OTEL_METRICS_EXPORTER=none` απενεργοποιεί τη δημιουργία reader,
  ενώ η προεπιλογή επιλέγει OTLP. Η παράλειψη option στον constructor δεν ισοδυναμεί
  με την πρώτη ρύθμιση.
- **Πού:** `ddd/users-api/src/tracing.ts`, `ddd/users-api/package.json`
  (`@opentelemetry/sdk-node`), `pnpm-lock.yaml`· εγκατεστημένο SDK:
  `build/src/sdk.js`, `getMetricReadersFromEnv` και `NodeSDK.start`.
- **Πρόταση:** Να τεκμηριωθούν οι ρυθμίσεις metrics/collector και να επαληθεύεται export
  στο περιβάλλον ανάπτυξης. Δεν χρειάζεται προσθήκη δεύτερου provider για να διορθωθεί
  ένας ανύπαρκτος υποχρεωτικός no-op.

### O-06 · users-api: το `ddd/users-api/src/tracing.ts` εμποδίζει τον τερματισμό σε SIGTERM/SIGINT

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Υψηλή (λειτουργικό)
- **Περιγραφή:** Το `process.on('SIGTERM', () => sdk.shutdown())` και το αντίστοιχο για
  `SIGINT` αφαιρούν την προεπιλεγμένη συμπεριφορά τερματισμού του Node. Κανείς δεν καλεί
  `app.close()` ή `process.exit()`, και δεν υπάρχει `enableShutdownHooks()`. Όταν το
  Kubernetes/Docker στείλει SIGTERM, τα spans αδειάζουν, αλλά ο HTTP server συνεχίζει να
  ακούει μέχρι να έρθει SIGKILL. Στην πράξη δεν γίνεται graceful shutdown: οι workers του
  BullMQ, η βάση και το Redis δεν κλείνουν ομαλά.
- **Παράδειγμα διαδρομής** (όχι end-to-end εκτέλεση της εφαρμογής):
  ```text
  node sig.js & kill -TERM $PID → "still alive after SIGTERM"
  ```
- **Πού:** `ddd/users-api/src/tracing.ts`, `ddd/users-api/src/bootstrap.ts`.
- **Πρόταση:** `app.enableShutdownHooks()` στο bootstrap, και τερματισμός του SDK μέσα από
  `OnApplicationShutdown`, με σαφή σειρά κλεισίματος. Ένα άμεσο `process.exit(0)` μετά το SDK μόνο
  δεν κλείνει σωστά workers, DB και HTTP server.

### O-07 · users-api: η σειρά των behaviors αφήνει τα logs του pipeline εκτός span

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Η global αλυσίδα είναι `logging → Trace → Metrics → …`. Επομένως οι γραμμές
  «Request/Response/completed» του `LoggingBehavior` γράφονται **πριν ανοίξει** και **αφού
  κλείσει** το span του pipeline, και δεν έχουν το trace id του handler, μόνο εκείνο του HTTP
  span, όταν υπάρχει. Για τα events και τις εργασίες BullMQ, που δεν έχουν HTTP span, τα logs
  του pipeline δεν αποκτούν από αυτό το pipeline το handler span· μπορεί να υπάρχει
  άλλο upstream span από instrumentation του consumer.
- **Παράδειγμα:** Με `Logging → Trace → handler`, το αρχικό request log γράφεται πριν δημιουργηθεί το handler span.
- **Πού:** `ddd/users-api/src/infrastructure/observability.module.ts`.

### O-08 · Αποτυχία του tracer μετά από επιτυχημένο handler αντικαθιστά το αποτέλεσμα

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα · **Σοβαρότητα:** Μεσαία
- **Προέλευση:** review2, επαληθεύτηκε με εκτέλεση.
- **Περιγραφή:** Το `runOnce` αποτρέπει σωστά τη δεύτερη εκτέλεση. Όμως αν το
  `startActiveSpan()` ρίξει **αφού** έτρεξε το callback, ο εξωτερικός `catch` κάνει
  `if (business !== undefined) throw error`, δηλαδή ρίχνει το **σφάλμα instrumentation**.
  Ένα command που ολοκληρώθηκε (και έκανε commit) εμφανίζεται στον καλούντα ως αποτυχία.
  Αυτό αντιφάσκει με το δηλωμένο fail-open contract («telemetry must not replace the business
  result») και μπορεί να οδηγήσει σε retry από τον client και διπλό side effect.
- **Αναπαραγωγή** (εκτελέστηκε με προσωρινό spec, που αφαιρέθηκε μετά): tracer του οποίου το
  `startActiveSpan` καλεί το callback και μετά ρίχνει. Ο handler επιστρέφει `'committed'` και
  τρέχει **μία** φορά, αλλά το `TraceBehavior.handle()` απορρίπτεται με
  «tracer broke after callback».
- **Πού:** `packages/pipeline-opentelemetry/src/trace.behavior.ts` (εξωτερικό `catch` γύρω από
  το `startActiveSpan`).
- **Πρόταση:** Όταν `business !== undefined`, επιστροφή του `business` (αποτέλεσμα ή αρχικό
  business error), όχι του σφάλματος του tracer.

### Σύνοψη `packages/pipeline-opentelemetry`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| O-01 | Σχόλια ιστορικού και υπερβολική τεκμηρίωση μηχανισμών | Αρχιτεκτονική πρόταση | Χαμηλή |
| O-02 | Το JSDoc του `MetricsBehavior` είναι κολλημένο σε άλλη συνάρτηση | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| O-03 | Παρόμοια instrumentation guards με διαφορετικά συμβόλαια | Αρχιτεκτονική πρόταση | Χαμηλή |
| O-04 | Τα context items των πακέτων δεν χρησιμοποιούν τα typed tokens του πυρήνα | Αρχιτεκτονική πρόταση | Μεσαία |
| O-05 | users-api: οι μετρικές εξαρτώνται από την αυτόματη ρύθμιση του NodeSDK | Αρχιτεκτονική πρόταση | Χαμηλή |
| O-06 | users-api: το `ddd/users-api/src/tracing.ts` εμποδίζει τον τερματισμό σε SIGTERM/SIGINT | Συμπέρασμα διαδρομής κώδικα | Υψηλή |
| O-07 | users-api: η σειρά των behaviors αφήνει τα logs του pipeline εκτός span | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| O-08 | Αποτυχία tracer μετά από επιτυχημένο handler αντικαθιστά το αποτέλεσμα | Αναπαραγόμενο ελάττωμα | Μεσαία |

---

## 5. `packages/pipeline-zod` (`@nestjs-pipeline/zod`)

**Ρόλος:** δημιουργεί command/query κλάσεις από σχήματα Zod (`createCommand`,
`createQuery`). Περιλαμβάνει επίσης behavior που επικυρώνει ξανά το αίτημα μέσα στο pipeline
(`ZodValidationBehavior`), pipe για τον controller (`ZodPipe`), και ουδέτερο ως προς το
transport σφάλμα με filter.

**Χρήση στο users-api:** global `ZodValidationBehavior`
(`ddd/users-api/src/infrastructure/observability.module.ts`), `ZodPipe` σε όλους τους controllers, `createCommand` /
`createQuery` σε όλα τα commands και queries, `ZodValidationFilter` στο `ddd/users-api/src/bootstrap.ts`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/zod test` → 131 tests, όλα περνούν.

**Συνολική εκτίμηση:** το provenance προστατεύει single-transform semantics και εντοπίζει
μεταβολές payload. Τα metadata είναι υποστηριζόμενη επιφάνεια. Η πιο συγκεκριμένη
ευκαιρία απλοποίησης βρίσκεται στα επαναλαμβανόμενα schemas του users-api.

### Z-01 · Τα αναγνώσιμα Zod metadata δεν αποτελούν απόδειξη επικύρωσης

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Τα `getRawInput`/`getValidatedData` υποστηρίζουν δημόσια symbols ως
  αναγνώσιμα metadata. Το README και το JSDoc δηλώνουν ότι αυτά **δεν** θεμελιώνουν
  trusted validation. Το behavior εμπιστεύεται το εσωτερικό `WeakMap` μέσω
  `getValidationState`, όχι το symbol. Δεν τεκμηριώνεται test-only API ή bypass επικύρωσης.
- **Παράδειγμα:** `getValidatedData({ [ZOD_VALIDATED_DATA_KEY]: { role: 'admin' } })`
  διαβάζει το metadata, αλλά το ίδιο αντικείμενο εξακολουθεί να περνά από schema parsing
  όταν φτάσει στο `ZodValidationBehavior` χωρίς εσωτερικό validation state.
- **Πού:** `packages/pipeline-zod/src/helpers/zod-data.helpers.ts`,
  `packages/pipeline-zod/src/zod-validation.behavior.ts`,
  `packages/pipeline-zod/README.md`.
- **Πρόταση:** Να μη χρησιμοποιείται το inspection helper ως security predicate.
  Διατήρηση συμβατότητας· η διαγραφή των symbols δεν δικαιολογείται από την τοπική χρήση.

### Z-02 · Κόστος του validation provenance χωρίς μέτρηση απόδοσης

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Clone, deep equality και `WeakMap` συνδέουν το schema με το payload
  που επικυρώθηκε. Αποφεύγουν δεύτερο transform/refinement σε αμετάβλητο command και
  επιτρέπουν επανέλεγχο μεταβολών και manually constructed requests. Δεν υπάρχει μέτρηση
  που να αποδεικνύει ότι κοστίζουν όσο το validation ή ότι είναι περιττά. Οι serializers
  για logging/JSON δεν είναι ισοδύναμοι: χάνουν rich types, cycles ή ταυτότητα αναφορών.
- **Παράδειγμα:** Transform `n => n + 1` πρέπει να εφαρμοστεί μία φορά, όχι ξανά από το
  global behavior μετά τον constructor. Το `Object.freeze(request)` είναι ρηχό και
  δεν προστατεύει nested μεταβολές· δεν αντικαθιστά μόνο του αυτό το συμβόλαιο.
- **Πού:** `packages/pipeline-zod/src/helpers/zod-data.helpers.ts`,
  `packages/pipeline-zod/src/zod-validation.behavior.ts`,
  `packages/pipeline-zod/src/create-zod-request.ts`.
- **Πρόταση:** Benchmark και απλοποίηση μόνο με διατήρηση single-transform semantics,
  mutation detection και υποστήριξης χειροκίνητων requests.

### Z-03 · Το behavior αλλάζει το αίτημα επιτόπου και σβήνει πεδία της κλάσης

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Όταν το αίτημα δεν έχει επικυρωθεί, το behavior κάνει `delete` σε **κάθε**
  own enumerable κλειδί που δεν υπάρχει στο output του σχήματος. Σβήνονται επομένως και
  enumerable πεδία που ανήκουν στην κλάση (π.χ. ένα event με πεδίο που δεν περιγράφεται στο
  σχήμα). Επίσης, behaviors που τρέχουν **πριν** από το Zod (logging, trace, metrics στο
  users-api) βλέπουν διαφορετικό αντικείμενο από όσα τρέχουν μετά. Τα commands και τα events
  αντιμετωπίζονται ως μεταβλητά αντικείμενα.
- **Παράδειγμα:** Χειροκίνητο request με enumerable `debugTag`, εκτός του schema output, χάνει το πεδίο κατά το πρώτο parse. Το behavior τεκμηριώνει αυτή την in-place κανονικοποίηση.
- **Πού:** `packages/pipeline-zod/src/zod-validation.behavior.ts`.

### Z-04 · Δημόσια metadata με πολλαπλά ονόματα

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Τα `requestKind`, `schema` και `_zodSchema` ανήκουν στο τεκμηριωμένο
  consumer API. Το pipeline διαβάζει `_zodSchema`, ενώ το `requestKind` μπορεί να
  χρησιμοποιηθεί από εξωτερικά εργαλεία. Η απουσία τοπικού reader δεν τα καθιστά νεκρά.
  Το string key `_zodSchema` απαιτεί προσοχή σε custom κλάσεις ώστε να μη σκιαστεί.
- **Παράδειγμα:** Custom request που ορίζει άσχετο static `_zodSchema` επηρεάζει τη
  schema discovery του behavior, ενώ τα generated requests εκθέτουν και `.schema`.
- **Πού:** `packages/pipeline-zod/src/create-zod-request.ts`,
  `packages/pipeline-zod/src/zod-validation.behavior.ts`,
  `packages/pipeline-zod/README.md`.
- **Πρόταση:** Ρητή τεκμηρίωση των δύο ρόλων και έλεγχος consistency των aliases.
  Αλλαγή string σε symbol ή αφαίρεση metadata απαιτεί συμβατότητα consumers.

### Z-05 · Δύο διαφορετικά σχήματα απόκρισης για το ίδιο σφάλμα επικύρωσης

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `ZodPipe` ρίχνει `BadRequestException(result.error.flatten())`, που
  δίνει το σχήμα απόκρισης του Nest. Το `ZodValidationFilter` επιστρέφει
  `{ statusCode, error, message: 'Validation failed', details }`. Ο πελάτης του API
  λαμβάνει επομένως δύο διαφορετικές μορφές 400, ανάλογα με το πού απέτυχε η επικύρωση
  (στο DTO ή στο command). Και οι δύο χρησιμοποιούν το `flatten()`, που στο Zod 4 έχει
  αντικατασταθεί από το `z.flattenError()`.
- **Παράδειγμα:** Αποτυχία DTO pipe επιστρέφει flattened Zod errors, ενώ αποτυχία command validation μέσω filter προσθέτει `statusCode`, `message` και `details`.
- **Πού:** `packages/pipeline-zod/src/pipes/zod-param.pipe.ts`,
  `packages/pipeline-zod/src/filters/zod-validation.filter.ts`, `packages/pipeline-zod/src/errors/zod-validation.error.ts`.

### Z-06 · users-api: ο ίδιος κανόνας επικύρωσης τρεις φορές στο ίδιο μονοπάτι

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Για ένα `PATCH /users/:id`, υπάρχουν τρία στάδια parsing
  (DTO, mapper, command constructor), ενώ το behavior παραλείπει νέο parse όταν το
  constructor payload δεν έχει αλλάξει. Οι επαναλήψεις είναι:
  1. `ZodPipe(UpdateUserDtoSchema)` — `min(3)` και refine «At least one mutable field must be
     supplied.»
  2. `UpdateUserMapper` — επαναχρησιμοποίηση shape με `.extend(UpdateUserDtoShape)` και **ξανά** το ίδιο
     refine, αντιγραμμένο αυτολεξεί.
  3. Ο constructor του `UpdateUserCommand` — τρίτο σχήμα με τους ίδιους κανόνες και refine με
     **άλλο** μήνυμα («At least one of username or department must be provided»).
  4. Το `ZodValidationBehavior` — ελέγχει provenance/mutation και συνήθως **δεν** ξανακάνει parse.

  Αν αλλάξει το ελάχιστο μήκος στο ένα σχήμα και όχι στα άλλα, προκύπτουν αντιφατικά 400.
- **Παράδειγμα:** Κενό update `{}` απορρίπτεται από DTO/mapper με «At least one mutable field…» και από command schema με διαφορετικό μήνυμα για τον ίδιο περιορισμό.
- **Πού:** `ddd/users-api/src/users/dtos/update-user.dto.ts`,
  `ddd/users-api/src/users/mappers/update-user.mapper.ts`,
  `ddd/users-api/src/users/cqrs/commands/update-user.command.ts`.

### Z-07 · Ο σύγχρονος constructor με async σχήμα ρίχνει σφάλμα εκτός του contract επικύρωσης

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα (κίνδυνος συμβολαίου) · **Σοβαρότητα:** Χαμηλή
- **Προέλευση:** review2, επαληθεύτηκε με εκτέλεση.
- **Περιγραφή:** Ο constructor των `createCommand`/`createQuery` καλεί `schema.safeParse()`. Με
  async refinement/transform, το Zod ρίχνει `$ZodAsyncError`, **όχι** `ZodValidationError`.
  Το `ZodValidationFilter` δεν το χαρτογραφεί, οπότε γίνεται 500. Η σωστή διαδρομή είναι το
  `parseAsync()`. Ο περιορισμός τεκμηριώνεται στο JSDoc του `ZodRequestClass`, αλλά το ίδιο
  generated class έχει έτσι δύο συμβόλαια κατασκευής.
- **Αναπαραγωγή** (εκτελέστηκε):
  ```text
  class C extends createCommand(z.object({ n: z.number() }).refine(async () => true)) {}
  new C({ n: 1 })         → $ZodAsyncError: Encountered Promise during synchronous parse…
  await C.parseAsync(...) → instance του C
  ```
- **Πού:** `packages/pipeline-zod/src/create-zod-request.ts` (constructor, `parseAsync`).
- **Πρόταση:** Μετατροπή του async error σε σαφές σφάλμα διαμόρφωσης που παραπέμπει στο
  `parseAsync`, ή έλεγχος στο `createCommand` όταν το σχήμα είναι γνωστό ως async.

### Σύνοψη `packages/pipeline-zod`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| Z-01 | Τα αναγνώσιμα Zod metadata δεν αποτελούν απόδειξη επικύρωσης | Κίνδυνος συμβολαίου | Χαμηλή |
| Z-02 | Κόστος του validation provenance χωρίς μέτρηση απόδοσης | Αρχιτεκτονική πρόταση | Χαμηλή |
| Z-03 | Το behavior αλλάζει το αίτημα επιτόπου και σβήνει πεδία της κλάσης | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| Z-04 | Δημόσια metadata με πολλαπλά ονόματα | Αρχιτεκτονική πρόταση | Χαμηλή |
| Z-05 | Δύο διαφορετικά σχήματα απόκρισης για το ίδιο σφάλμα επικύρωσης | Κίνδυνος συμβολαίου | Χαμηλή |
| Z-06 | users-api: ο ίδιος κανόνας επικύρωσης τρεις φορές στο ίδιο μονοπάτι | Αρχιτεκτονική πρόταση | Μεσαία |
| Z-07 | Σύγχρονος constructor με async σχήμα ρίχνει `$ZodAsyncError` αντί για `ZodValidationError` | Αναπαραγόμενο ελάττωμα | Χαμηλή |

---

## 6. `packages/pipeline-audit` (`@nestjs-pipeline/audit`)

**Ρόλος:** γράφει ένα audit record για κάθε αίτημα που ελέγχεται, σε επιτυχία και σε
αποτυχία, σε έναν pluggable sink (`LogAuditSink`, `PostgresAuditSink`). Υποστηρίζει
fail-open και fail-closed.

**Χρήση στο users-api:** `AuditModule.forRoot({ defaults: AUDIT_MODULE_DEFAULTS })` στο
`ddd/users-api/src/infrastructure/observability.module.ts` και `audit(...)` σε 4 handlers.
`ddd/users-api/src/common/audit/audit.options.ts` ορίζει τον actor από το session.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/audit test` → 72 tests, όλα περνούν.

**Συνολική εκτίμηση:** το σχήμα του record και η σημασία fail-open/fail-closed είναι σωστά.
Υπάρχει όμως κώδικας αντιγραμμένο τρεις φορές, έλεγχοι σε κάθε αίτημα αντί για το
bootstrap-contract του πυρήνα, και ένας ακόμη serializer. Στη χρήση υπάρχει επιλεκτική κάλυψη commands. Επιπλέον, το fail-open
δεν προστατεύεται από σφάλματα του diagnostic logger.

### AU-01 · Ίδιο μπλοκ επικύρωσης τρεις φορές, και σε κάθε αίτημα

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Το `validateFactories` περιέχει το **ίδιο** μπλοκ 17 γραμμών τρεις φορές,
  για τα `actor`, `metadata` και `redact`: έλεγχος τύπου, `TypeError`, και log με warn ή
  error ανάλογα με το `failOpen`. Επιπλέον εκτελείται σε **κάθε** αίτημα, για options που
  καθορίζονται στατικά στο decorator. Ο πυρήνας έχει ακριβώς τον μηχανισμό γι' αυτό,
  `PIPELINE_BEHAVIOR_CONTRACT.validate`, ώστε να αποτυγχάνει το bootstrap. Το audit δεν τον
  χρησιμοποιεί, οπότε ένα λάθος στη διαμόρφωση φαίνεται μόνο στην πρώτη κλήση του handler.
- **Παράδειγμα:** `actor: 'user'` από JavaScript consumer εντοπίζεται στην κλήση του handler· ο ίδιος τύπος ελέγχου επαναλαμβάνεται για `metadata` και `redact`.
- **Πού:** `packages/pipeline-audit/src/audit.behavior.ts`,
  `packages/pipeline/src/interfaces/pipeline-behavior-contract.interface.ts`.

### AU-02 · Αλλαγή του αντικειμένου σφάλματος της επιχειρησιακής λογικής

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Με `failOpen: false`, όταν αποτύχουν και ο handler και το audit, το
  behavior γράφει `error.cause = auditError` πάνω στο **ξένο** αντικείμενο σφάλματος. Αν το
  σφάλμα είναι κοινό instance (π.χ. στατικό domain error) ή καταγράφεται αλλού, η αλλαγή
  διαρρέει σε άσχετες ροές. Το μπλοκ `try { … } catch { // Intentionally ignored }` που το
  προστατεύει δείχνει ότι ο σχεδιασμός το γνωρίζει.
- **Παράδειγμα:** Handler που ρίχνει κοινό `Error` instance μπορεί να το δει αργότερα με `cause` από αποτυχία audit, παρότι δεν το τροποποίησε ο ίδιος.
- **Πού:** `packages/pipeline-audit/src/audit.behavior.ts`.

### AU-03 · Δύο αναπαραστάσεις tenant και επανάληψη της μετατροπής προς SQL

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το record περιέχει top-level `tenantId` και `metadata.tenantId`.
  Ο Postgres sink συγχωνεύει ξανά την τιμή στο metadata επειδή το SQL σχήμα δεν έχει
  ξεχωριστή στήλη tenant. Δεν αποθηκεύει τρίτο ανεξάρτητο αντίγραφο: επαναλαμβάνει την
  ίδια μετατροπή στο όριο persistence.
- **Παράδειγμα:** Η επιλογή tenant σε SQL γίνεται από `metadata->>'tenantId'`.
  Αυτό δεν σημαίνει αναγκαστικά full scan: επιτρέπεται expression index στο JSONB.
- **Πού:** `packages/pipeline-audit/src/helpers/build-record.ts`,
  `packages/pipeline-audit/src/sinks/postgres.sink.ts`.
- **Πρόταση:** Ένας ιδιοκτήτης της μετατροπής και τεκμηριωμένο σχήμα. Ξεχωριστή στήλη
  μόνο αν δικαιολογείται από τις αναζητήσεις/indexes του consumer.

### AU-04 · Διαφορετικό audit serialization contract και επανάληψη enum τιμών

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Το `packages/pipeline-audit/src/helpers/json.ts` (`stringifyAuditValue`) είναι ο **πέμπτος** κανονικοποιητής τιμών
    στο αποθετήριο, μετά τα `safeSanitize`, `toStrictJsonValue`, `cloneData` (zod) και το
    JSON clone του `MemoryCache`, και με δικούς του κανόνες (`$type` tags). Αυτό είναι διακριτό συμβόλαιο
    διατήρησης rich values, όχι απόδειξη περιττής αντιγραφής· JSON cloning ή sanitization
    δεν το αντικαθιστούν με ισοδύναμη συμπεριφορά.
  - Τα `AUDIT_SEVERITY`, `AUDIT_OUTCOMES` και `AUDIT_REQUEST_KINDS` ορίζονται **χωριστά** από
    τους τύπους `AuditSeverity`, `AuditOutcome` και `AuditRequestKind`, αντί ο τύπος να
    προκύπτει από τη σταθερά. Δύο πηγές αλήθειας. Το `UNKNOWN: 'unknown'` αφορά και εξωτερικά contexts
    (βλ. P-05), επομένως η απουσία Nest discovery caller δεν δικαιολογεί διαγραφή.
  - Το `packages/pipeline-audit/src/helpers/redact.ts` είναι αρχείο που μόνο επανεξάγει από τον πυρήνα (βλ. P-03).
- **Παράδειγμα:** Audit `BigInt` αποθηκεύεται με `$type` tag, ενώ οι constants `AUDIT_OUTCOMES` και ο χωριστός union τύπος πρέπει να ενημερώνονται μαζί.
- **Πού:** `packages/pipeline-audit/src/helpers/json.ts`, `packages/pipeline-audit/src/constants/tokens.ts`,
  `packages/pipeline-audit/src/interfaces/audit-record.interface.ts`.

### AU-05 · Η σειρά του audit εξαρτάται και από τα αποτυχημένα auth paths

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Ο actor υπολογίζεται μετά το `next()`, αλλά αυτό δεν κάνει τη σειρά
  auth/audit αδιάφορη. Auth που απορρίπτει πριν δημιουργήσει actor αφήνει διαφορετικό
  context, ενώ auth που εγκαθιστά προσωρινό context μπορεί να το καθαρίσει στο unwind.
  Audit έξω από auth μπορεί να καταγράψει την απόρριψη· audit μέσα του μπορεί να μην τρέξει.
- **Παράδειγμα:** `Audit → Auth(throw)` παράγει failure record, ενώ `Auth(throw) → Audit`
  δεν φτάνει ποτέ στο audit. Η επιλογή είναι πολιτική κάλυψης, όχι ισοδύναμη αναδιάταξη.
- **Πού:** `packages/pipeline-audit/src/audit.behavior.ts`,
  `packages/pipeline-audit/src/helpers/build-record.ts`.
- **Πρόταση:** Το JSDoc να περιγράφει το trade-off κάλυψης απορρίψεων/διαθεσιμότητας actor.

### AU-06 · users-api: επιλεκτική κάλυψη audit στα commands

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Το `AuditBehavior` δεν είναι global. Εφαρμόζεται στα `delete-user`,
  `delete-role`, `create-auth`, `refresh-auth`, αλλά όχι στα `create-user`, `update-user`,
  `create-role`, `update-role`, `delete-auth`. Το `update-role` αλλάζει **μόνο όνομα**,
  όχι capabilities: ο προηγούμενος ισχυρισμός για αλλαγή δικαιωμάτων μέσω αυτού του
  command δεν στηρίζεται στο σημερινό schema/handler. Η επιλεκτική κάλυψη πρέπει να
  αξιολογηθεί ως πολιτική της εφαρμογής αναφοράς, όχι ως αποδεδειγμένη παράβαση compliance.
- **Παράδειγμα:** `PATCH /users/:id` αλλάζει department, που μπορεί να επηρεάζει
  conditional authorization, χωρίς `AuditRecord` από αυτό το behavior. Υπάρχουν
  γενικά pipeline logs, που δεν είναι το ίδιο συμβόλαιο καταγραφής.
- **Πού:** `ddd/users-api/src/infrastructure/observability.module.ts`,
  `ddd/users-api/src/users/cqrs/commands/update-user.handler.ts`,
  `ddd/users-api/src/roles/cqrs/commands/update-role.command.ts`,
  `ddd/users-api/src/roles/cqrs/commands/update-role.handler.ts`,
  `packages/pipeline-audit/src/sinks/log.sink.ts`.
- **Συμπλήρωμα (review2, επαληθεύτηκε):** το `AUDIT_MODULE_DEFAULTS` ορίζει μόνο `actor`.
  Επομένως ισχύει το `failOpen: true` του πακέτου, και τα `delete-user`/`delete-role` με
  `severity: HIGH` ολοκληρώνονται ακόμη κι αν αποτύχει ο sink. Ο sink είναι το
  `LogAuditSink` (console), όχι durable αποθήκη. Το JSDoc του `ObservabilityModule` όμως
  περιγράφει «Compliance Auditing». Επίσης το `sink.write()` είναι μέρος της αλυσίδας: με
  απομακρυσμένο sink η καθυστέρηση του sink προστίθεται στο αίτημα, και με `failOpen: false`
  προστίθεται και η αποτυχία του.
- **Πρόταση:** Ρητή κάλυψη ανά command ή global audit για commands, με καθορισμένη θέση
  ως προς auth/replay και στοχευμένες εξαιρέσεις. Το default console sink έχει δική του
  σειριοποίηση/redaction· για ενιαίο logging μπορεί να δοθεί sink που χρησιμοποιεί Pino.
  Για ενέργειες που απαιτούν αποδεικτικό audit: durable sink και `failOpen: false` ανά handler,
  ή τεκμηρίωση ότι το audit του users-api είναι επιχειρησιακό log και όχι compliance ledger.

### AU-07 · Το αρνητικό type test προστατεύει το δημόσιο σχήμα options

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `@ts-expect-error` για άγνωστο `metadataFactory` προστατεύει το
  συμβόλαιο του audit helper. Δεν είναι άχρηστο επειδή βασίζεται στον compiler: αν
  το API διευρυνθεί σε `any` ή index signature, το typecheck μπορεί να εντοπίσει ότι
  η αναμενόμενη απόρριψη χάθηκε. Η απλή εκτέλεση Vitest/SWC δεν αποδεικνύει αυτόν τον έλεγχο.
- **Παράδειγμα:** Αφαίρεση των περιορισμών από τον τύπο options κάνει το
  `@ts-expect-error` αχρησιμοποίητο και το `tsc --noEmit` πρέπει να αποτύχει.
- **Πού:** `ddd/users-api/src/common/audit/audit.options.spec.ts`,
  `ddd/users-api/vitest.config.ts`, `ddd/users-api/tsconfig.json`.
- **Πρόταση:** Διατήρηση χρήσιμων αρνητικών type tests και εκτέλεση του typecheck.
  Τα ονόματα να περιγράφουν άγνωστα options, χωρίς υπόθεση για ιστορικό αλλαγών.

### AU-08 · Ο logger μπορεί να ακυρώσει το `failOpen` του audit

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Σε αποτυχία sink/build, το audit καλεί `logger.warn/error` χωρίς
  προστασία. Το optional chaining ελέγχει την παρουσία της μεθόδου, όχι αν ρίχνει.
  Έτσι το διαγνωστικό logging μπορεί να αλλάξει το αποτέλεσμα που το fail-open
  συμβόλαιο υπόσχεται να διατηρήσει.
- **Αναπαραγωγή** (εκτελέστηκε μέσω `AuditBehavior.handle`): Handler επιστρέφει
  `'committed'`, sink ρίχνει error και injected `logger.warn` επίσης ρίχνει. Με
  `failOpen: true`, το `handle()` απορρίπτεται με το **logger error** αντί να επιστρέψει
  `'committed'`.
- **Πού:** `packages/pipeline-audit/src/audit.behavior.ts`.
- **Πρόταση:** Fail-open προστασία στις diagnostic κλήσεις, χωρίς αλλαγή της πολιτικής
  sink failure ή του αρχικού business error. Σύγκριση με τα safeguards του core/OTel.
  Παρόμοιες ακάλυπτες diagnostic κλήσεις σε άλλα behaviors χρειάζονται ανεξάρτητο
  έλεγχο· η συγκεκριμένη αναπαραγωγή αποδεικνύει μόνο το audit path.

### Σύνοψη `packages/pipeline-audit`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| AU-01 | Ίδιο μπλοκ επικύρωσης τρεις φορές, και σε κάθε αίτημα | Αρχιτεκτονική πρόταση | Μεσαία |
| AU-02 | Αλλαγή του αντικειμένου σφάλματος της επιχειρησιακής λογικής | Κίνδυνος συμβολαίου | Χαμηλή |
| AU-03 | Δύο αναπαραστάσεις tenant και επανάληψη της μετατροπής προς SQL | Αρχιτεκτονική πρόταση | Χαμηλή |
| AU-04 | Διαφορετικό audit serialization contract και επανάληψη enum τιμών | Αρχιτεκτονική πρόταση | Χαμηλή |
| AU-05 | Η σειρά του audit εξαρτάται και από τα αποτυχημένα auth paths | Αρχιτεκτονική πρόταση | Χαμηλή |
| AU-06 | users-api: επιλεκτική κάλυψη audit στα commands | Συμπέρασμα διαδρομής κώδικα | Μεσαία |
| AU-07 | Το αρνητικό type test προστατεύει το δημόσιο σχήμα options | Αρχιτεκτονική πρόταση | Χαμηλή |
| AU-08 | Ο logger μπορεί να ακυρώσει το `failOpen` του audit | Αναπαραγόμενο ελάττωμα | Μεσαία |

---

## 7. `packages/pipeline-cache` (`@nestjs-pipeline/cache`)

**Ρόλος:** cache αποτελεσμάτων στο επίπεδο του pipeline (`CacheBehavior`) πάνω σε
`cache-manager`/Keyv, με κλειδιά χωρισμένα ανά tenant, principal και scope
(`createPartitionedCacheKeyFactory`). Είναι συμπληρωματικό του repository cache στο
`ddd/core` (κανόνας 16).

**Χρήση στο users-api:** `CacheModule.forRoot(...)` στο
`ddd/users-api/src/infrastructure/reliability.module.ts`,
`ddd/users-api/src/users/cqrs/queries/user-overview-cache.policy.ts`, `ddd/users-api/src/users/cqrs/queries/get-user-overview.handler.ts`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/cache test` → 76 tests, όλα περνούν.

**Συνολική εκτίμηση:** το σχήμα του κλειδιού είναι σωστό. Κλείνει ασφαλώς όταν λείπει
tenant ή principal, κρατά το payload μόνο ως digest, και το bootstrap contract απαιτεί
`key` και ελέγχει τη σειρά σε σχέση με το CASL. Η πολιτική του users-api (scope από το hash
των κανόνων και παράκαμψη όταν υπάρχουν συνθήκες οντότητας) είναι υποδειγματική. Τα
προβλήματα αφορούν τον κύκλο ζωής της σύνδεσης, τη διαφορετική μορφή του αποτελέσματος σε
hit και miss, και μια προεπιλογή που δεν κλείνει ασφαλώς.

### CA-01 · Διαφορετικός τύπος αποτελέσματος σε hit και σε miss

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Σε miss ο handler επιστρέφει την πραγματική τιμή (π.χ. `Date`, instance
  κλάσης). Σε hit επιστρέφεται ό,τι αποθήκευσε το Keyv. Επειδή το Keyv σειριοποιεί ως JSON
  ακόμη και στη μνήμη, το `Date` γίνεται string και το instance χάνει το prototype του.
  Ένας καταναλωτής που κάνει `result.createdAt.getTime()` δουλεύει στο πρώτο αίτημα και
  σκάει στο δεύτερο. Το JSDoc δεν αναφέρει ότι τα αποτελέσματα πρέπει να είναι JSON.
- **Αναπαραγωγή** (εκτελέστηκε):
  ```text
  set('k', { a: 1, d: new Date(0) }); get('k') → same ref: false, date type: false
  ```
- **Πού:** `packages/pipeline-cache/src/cache.behavior.ts`.
- **Πρόταση:** Να τεκμηριωθεί και να ελέγχεται (π.χ. `toStrictJsonValue` πριν την
  εγγραφή), ή να αξιολογηθεί προαιρετικό `serialize`/`hydrate`. Η κανονικοποίηση μόνο
  πριν την αποθήκευση δεν εξισώνει hit/miss αν στο miss επιστρέφεται ακόμη το αρχικό instance.

### CA-02 · Σύνδεση με το backend κατά το import, χωρίς κλείσιμο

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Το `CacheModule.forRoot()` καλεί **αμέσως** το `buildCache(options)` και
  γράφει log, δηλαδή τη στιγμή που αξιολογείται ο decorator `@Module` (όταν γίνεται import
  το αρχείο). Όχι μέσα σε provider factory. Αυτό σημαίνει ότι:
  - Δεν υπάρχει `forRootAsync`, οπότε το URL πρέπει να διαβαστεί από το `process.env` τη
    στιγμή του import. Το users-api το κάνει ακριβώς έτσι.
  - Το πακέτο δεν κλείνει ποτέ τα Keyv/Redis clients που δημιουργεί (δεν υπάρχει
    `onModuleDestroy`/`disconnect`). Το `app.close()` αφήνει ανοιχτές συνδέσεις.
  - Δύο εφαρμογές που εισάγουν την ίδια ήδη αξιολογημένη δήλωση module μοιράζονται
    το `useValue` instance. Δύο ανεξάρτητες κλήσεις `forRoot()` δημιουργούν διαφορετικά caches.
- **Παράδειγμα:** Δύο Nest applications που εισάγουν την ίδια αξιολογημένη module declaration χρησιμοποιούν το ίδιο `useValue: cache`, χωρίς hook του πακέτου για το κλείσιμό του.
- **Πού:** `packages/pipeline-cache/src/cache.module.ts`,
  `ddd/users-api/src/infrastructure/reliability.module.ts`.

### CA-03 · Το scope δικαιωμάτων είναι προαιρετικό από προεπιλογή

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Ο κανόνας 5 ζητά το κλειδί να περιέχει το scope δικαιωμάτων «whenever
  those dimensions can change the final authorized response» και να κλείνει ασφαλώς όταν
  λείπει. Στο `createPartitionedCacheKeyFactory` όμως η προεπιλογή είναι
  `requireScope: false`: αν δεν επιλυθεί scope, το τμήμα απλώς παραλείπεται και το κλειδί
  γίνεται κοινό για όλες τις εκδόσεις δικαιωμάτων του principal. Ένας χρήστης που χάνει
  έναν ρόλο διαβάζει αποκρίσεις του παλιού ρόλου μέχρι να λήξει το TTL. Το users-api
  ορίζει σωστά `requireScope: true`, αλλά consumer με permission-dependent αποτέλεσμα πρέπει να το ορίσει
  ρητά. Για αποτελέσματα που δεν εξαρτώνται από permissions, η παράλειψη scope είναι
  θεμιτή· ο κίνδυνος δεν αφορά κάθε χρήση του helper.
- **Παράδειγμα:** Αν το key περιέχει μόνο tenant/principal/request, αλλαγή permission scope δεν αλλάζει το key ενός permission-dependent response.
- **Πού:** `packages/pipeline-cache/src/helpers/cache-key.ts`.
- **Πρόταση:** Προεπιλογή `requireScope: true`, με ρητό opt-out μαζί με `requirePrincipal`
  για δημόσιες αποκρίσεις.

### CA-04 · Ιστορικό σχόλιο adapter και υποστηριζόμενο structural cache interface

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το σχόλιο του `CacheManagerAdapter` περιγράφει παλιά μεταβολή ownership
  και χρειάζεται συντόμευση. Το τύλιγμα ενός `IPipelineCache` όμως δεν παραβιάζει από
  μόνο του τον τύπο: ο adapter καλεί `get`/`set` με τις ίδιες υπογραφές, και τα event
  listeners εγκαθίστανται μόνο αν υπάρχει `.on`. Το re-export του `stableStringify`
  παραπέμπει στην κοινή υλοποίηση και δεν είναι αντιγραφή λογικής.
- **Παράδειγμα:** Custom `{ get, set }` χωρίς event emitter λειτουργεί με τον adapter·
  δεν αποδείχθηκε αποτυχία αυτής της υποστηριζόμενης εισόδου.
- **Πού:** `packages/pipeline-cache/src/adapters/cache-manager.adapter.ts`,
  `packages/pipeline-cache/src/cache.behavior.ts`,
  `packages/pipeline-cache/src/index.ts`.
- **Πρόταση:** Σύντομη περιγραφή ownership και ορίων error observation.
  Όχι αφαίρεση του structural interface ή των exports χωρίς συμβατότητα.

### CA-05 · Ο εντοπισμός σφαλμάτων φόρτωσης βασίζεται στο κείμενο μηνυμάτων

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Τα `isRequestedModuleMissing` και `isNativeBindingFailure` ταξινομούν τα
  σφάλματα με `message.includes('bindings file' | 'invalid ELF header' | …)`. Είναι 40
  γραμμές διάγνωσης που εξαρτώνται από το κείμενο των μηνυμάτων του Node και του
  node-gyp, για να αλλάξει απλώς η οδηγία εγκατάστασης. Με το ίδιο μοτίβο γίνεται η
  αναγνώριση σφαλμάτων στο `packages/pipeline/src/services/pipeline.bootstrap.service.ts` (P-07).
- **Παράδειγμα:** Native loading error με κείμενο `invalid ELF header` παίρνει ειδική διάγνωση· διαφορετικό μήνυμα μπορεί να πέσει στη γενική. Δεν αποδείχθηκε απόκρυψη αρχικού σφάλματος.
- **Πού:** `packages/pipeline-cache/src/helpers/cache-factory.ts`.

### Σύνοψη `packages/pipeline-cache`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| CA-01 | Διαφορετικός τύπος αποτελέσματος σε hit και σε miss | Αναπαραγόμενο ελάττωμα | Μεσαία |
| CA-02 | Σύνδεση με το backend κατά το import, χωρίς κλείσιμο | Συμπέρασμα διαδρομής κώδικα | Μεσαία |
| CA-03 | Το scope δικαιωμάτων είναι προαιρετικό από προεπιλογή | Κίνδυνος συμβολαίου | Μεσαία |
| CA-04 | Ιστορικό σχόλιο adapter και υποστηριζόμενο structural cache interface | Αρχιτεκτονική πρόταση | Χαμηλή |
| CA-05 | Ο εντοπισμός σφαλμάτων φόρτωσης βασίζεται στο κείμενο μηνυμάτων | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |

---

## 8. `packages/pipeline-deadletter` (`@nestjs-pipeline/deadletter`)

**Ρόλος:** κρατά τα αιτήματα που απέτυχαν (μετά από τα retries) και τα στέλνει σε transport
(BullMQ, RabbitMQ, Postgres) για επιθεώρηση.

**Χρήση στο users-api:** global για `commands` και `events`
(`ddd/users-api/src/infrastructure/observability.module.ts`), `DeadLetterModule` στο
`ddd/users-api/src/infrastructure/reliability.module.ts`, λίστα εξαιρέσεων στο
`ddd/users-api/src/infrastructure/dead-letter.options.ts`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/deadletter test` → 53 tests, όλα περνούν.

**Συνολική εκτίμηση:** η λογική «μην κρύβεις το αρχικό σφάλμα» και το backpressure του
RabbitMQ είναι σωστά. Υπάρχουν κοινά μικρά helpers με το audit, αλλά διαφορετικές ευθύνες.
Η συγχώνευση options και η σειριοποίηση θέλουν σαφή contracts· το replay ανήκει στον consumer.

### DL-01 · Κοινά μικρά helpers στα audit/deadletter, διαφορετικές ευθύνες behaviors

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Υπάρχει πραγματική αντιγραφή του Postgres identifier guard και κοινά
  patterns module wiring/record metadata. Τα πακέτα όμως δεν είναι «σχεδόν αντίγραφα»:
  audit καταγράφει επιτυχίες και αποτυχίες με actor, severity και duration, ενώ deadletter
  κρατά μόνο αποτυχίες με πολιτική `ignoreErrors`/`rethrow`. Το `DeadLetterRecord` **δεν**
  έχει ενσωματωμένα retry metadata: τα πεδία του είναι correlation/tenant, request, payload,
  error, `failedAt` και ένα προαιρετικό `metadata` που δίνει η εφαρμογή (το JSDoc αναφέρει
  το attempt count μόνο ως παράδειγμα). Διαφέρουν επίσης οι serializers.
- **Παράδειγμα:** Το regex `SAFE_IDENTIFIER` και η `assertSafeTable` έχουν ίδιο σκοπό
  στα δύο SQL adapters. Αντίθετα, συγχώνευση `AuditRecord` και `DeadLetterRecord`
  θα απαιτούσε προαιρετικά πεδία και branches για διαφορετικά συμβόλαια.
- **Πού:** `packages/pipeline-deadletter/src/transports/postgres.transport.ts`,
  `packages/pipeline-audit/src/sinks/postgres.sink.ts`,
  `packages/pipeline-audit/src/helpers/build-record.ts`,
  `packages/pipeline-deadletter/src/helpers/build-record.ts`.
- **Πρόταση:** Αξιολόγηση μόνο μικρών, σημασιολογικά ίδιων helpers. Διατήρηση των δύο
  ανεξάρτητων behaviors και της downward εξάρτησης προς core. Όχι νέο «records» package
  ή γενικός module factory χωρίς αποδεδειγμένο όφελος συντήρησης.

### DL-02 · Συνδυαστική συγχώνευση του `ignoreErrors` (50 γραμμές)

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `resolveOptions` χειρίζεται χωριστά τους 4 συνδυασμούς πίνακα και
  συνάρτησης για defaults και handler, και επαναλαμβάνει τον βρόχο `instanceof` τρεις φορές.
  Αν το `ignoreErrors` κανονικοποιούνταν πρώτα σε predicate, η συγχώνευση θα ήταν μία γραμμή.
  Επιπλέον, η σημασία της συγχώνευσης διαφέρει από τα υπόλοιπα πακέτα: εδώ ενώνονται οι
  πίνακες (`redactKeys`, `ignoreErrors`), ενώ στο audit και στο cache ο handler
  **αντικαθιστά** την προεπιλογή. Το ίδιο option (`redactKeys`) συμπεριφέρεται διαφορετικά
  ανά πακέτο.
- **Παράδειγμα:** Default predicate και handler array πρέπει να συνδυαστούν ως `defaultPredicate(error) || array.some(...)`, διατηρώντας τη σημερινή ένωση εξαιρέσεων.
- **Πού:** `packages/pipeline-deadletter/src/dead-letter.behavior.ts`,
  `packages/pipeline-audit/src/audit.behavior.ts`.

### DL-03 · Τα dead-letter records απαιτούν ασφαλή ανακατασκευή πριν από replay

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το README δηλώνει ήδη application-specific replay worker/tool.
  Επομένως η απουσία replay API δεν παραβιάζει υπόσχεση αυτόματης επανεκτέλεσης.
  Ο πραγματικός κίνδυνος είναι να θεωρηθεί το redacted record πλήρες αρχικό command:
  το payload μπορεί να έχει χάσει μυστικά, prototype και rich values κατά τη μεταφορά.
  Το JSDoc του πεδίου payload το ονομάζει ακόμη «original request ... instance».
- **Παράδειγμα:** `password` γίνεται `[REDACTED]`, ενώ `Map` που διατηρεί το redactor
  γίνεται `{}` στο JSON του Postgres transport. Η άμεση επανεκτέλεση αυτού του payload
  δεν είναι ισοδύναμη με το αρχικό αίτημα.
- **Πού:** `packages/pipeline-deadletter/README.md`,
  `packages/pipeline-deadletter/src/interfaces/dead-letter-transport.interface.ts`,
  `packages/pipeline-deadletter/src/transports/postgres.transport.ts`,
  `packages/pipeline-deadletter/src/helpers/build-record.ts`.
- **Πρόταση:** Διόρθωση της περιγραφής payload και ρητό serialization/reconstruction
  contract ανά transport. Replay μόνο με επανέλεγχο authorization, operation identity
  και επάρκειας δεδομένων από τον consumer-owned worker.

### DL-04 · Πολλαπλά dead-letter records για εμφωλευμένα pipelines

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το behavior είναι global για commands και events. Όταν ένας handler στέλνει
  εσωτερικό command (ή ένα event handler στέλνει command) και αυτό αποτύχει, το εσωτερικό
  pipeline κάνει capture και rethrow. Το εξωτερικό κάνει **ξανά** capture στο ίδιο σφάλμα.
  Μία αποτυχία δίνει δύο records με το ίδιο correlation id, αλλά διαφορετικό request/handler. Αυτό μπορεί να είναι
  σκόπιμη per-invocation καταγραφή. Να οριστεί πολιτική deduplication/replay πριν
  θεωρηθεί σφάλμα· όχι γενική μετάλλαξη του error για σήμανση.
  Ίδιο αποτέλεσμα έχει και ένα `DeadLetterBehavior` που δηλώνεται **μέσα** από το
  `ResilienceBehavior`: γράφεται ένα record ανά προσπάθεια retry. Η τεκμηριωμένη σειρά
  (DLQ έξω από το retry) είναι σύμβαση διαμόρφωσης, και το contract του behavior δεν την
  ελέγχει (review2).
- **Παράδειγμα:** Command A καλεί command B που αποτυγχάνει: κάθε invocation μπορεί να παράγει δικό του record με κοινό correlation ID και διαφορετικό request name.
- **Πού:** `packages/pipeline-deadletter/src/dead-letter.behavior.ts`.

### DL-05 · users-api: χειροκίνητη λίστα «αναμενόμενων» σφαλμάτων

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `EXPECTED_REJECTIONS` απαριθμεί 17 συγκεκριμένες κλάσεις. Κάθε νέο
  domain exception που **δεν** προστίθεται εδώ θα γεμίζει την ουρά dead letters με
  επιχειρησιακές απορρίψεις. Η ρητή λίστα διατηρεί ορατά άγνωστα failures και misconfiguration errors.
  Δεν είναι λανθασμένη προεπιλογή από μόνη της. Κοινός framework-neutral classifier ή
  marker είναι εναλλακτική αρχιτεκτονική επιλογή, με κόστος αλλαγής της ιεραρχίας.
- **Παράδειγμα:** Νέα business rejection που δεν ανήκει στο `EXPECTED_REJECTIONS` καταγράφεται στη DLQ, ενώ ένα configuration error πρέπει να παραμείνει ορατό.
- **Πού:** `ddd/users-api/src/infrastructure/dead-letter.options.ts`.

### DL-06 · Η καταγραφή dead letter είναι best-effort, χωρίς αυτό να τεκμηριώνεται

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Προέλευση:** review2, επαληθεύτηκε στον κώδικα και στο README.
- **Περιγραφή:** Το `capture()` περικλείει και το `buildDeadLetterRecord` (με custom
  `redact`/`metadata`) και το `transport.send()` σε `try/catch`. Αν αποτύχει ο transport
  (π.χ. Redis/BullMQ εκτός λειτουργίας στο users-api) ή ρίξει ο redactor, γράφεται μόνο ένα
  `logger.error` και το record **χάνεται**. Το αρχικό σφάλμα διατηρείται σωστά. Το README
  περιγράφει capture «for inspection and replay» χωρίς να αναφέρει ότι η παράδοση είναι
  best-effort.
- **Παράδειγμα:** Αποτυχημένο command κατά τη διάρκεια διακοπής του Redis: ο caller παίρνει
  το σφάλμα, αλλά στη DLQ δεν υπάρχει εγγραφή, και το `DEAD_LETTER_ITEM` γίνεται `false`.
- **Πού:** `packages/pipeline-deadletter/src/dead-letter.behavior.ts` (`capture`),
  `packages/pipeline-deadletter/src/helpers/build-record.ts`,
  `packages/pipeline-deadletter/README.md`.
- **Πρόταση:** Ρητή δήλωση best-effort στο README. Όπου χρειάζεται εγγύηση, transport με δικό
  του durability contract (π.χ. outbox).

### Σύνοψη `packages/pipeline-deadletter`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| DL-01 | Κοινά μικρά helpers στα audit/deadletter, διαφορετικές ευθύνες behaviors | Αρχιτεκτονική πρόταση | Χαμηλή |
| DL-02 | Συνδυαστική συγχώνευση του `ignoreErrors` (50 γραμμές) | Αρχιτεκτονική πρόταση | Χαμηλή |
| DL-03 | Τα dead-letter records απαιτούν ασφαλή ανακατασκευή πριν από replay | Κίνδυνος συμβολαίου | Χαμηλή |
| DL-04 | Πολλαπλά dead-letter records για εμφωλευμένα pipelines | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| DL-05 | users-api: χειροκίνητη λίστα «αναμενόμενων» σφαλμάτων | Αρχιτεκτονική πρόταση | Χαμηλή |
| DL-06 | Η καταγραφή dead letter είναι best-effort, χωρίς αυτό να τεκμηριώνεται | Κίνδυνος συμβολαίου | Χαμηλή |

---

## 9. `packages/pipeline-feature-flags` (`@nestjs-pipeline/feature-flags`)

**Ρόλος:** επιτρέπει ή μπλοκάρει την εκτέλεση ενός handler με βάση ένα boolean flag του
OpenFeature. Υποστηρίζει fallback, allow-list variants, και πολιτική για τα σφάλματα του
provider.

**Χρήση στο users-api:** `FeatureFlagsModule.forRoot({ provider: new InMemoryProvider(...) })`
στο `ddd/users-api/src/infrastructure/reliability.module.ts`,
`featureFlag({ flag: 'user-registration' | 'role-creation' })` σε 2 handlers,
`ddd/users-api/src/common/filters/feature-disabled.filter.ts`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/feature-flags test` → 38 tests, όλα
περνούν.

**Συνολική εκτίμηση:** καθαρό behavior με σωστή προεπιλογή (`defaultValue: false`, κλείνει
ασφαλώς). Το targeting key δεν παράγεται αυτόματα από το correlation id, κάτι που
τεκμηριώνεται σωστά. Τα προβλήματα: global κατάσταση του OpenFeature, αποστολή
αναγνωριστικών σε τρίτο provider χωρίς να το ζητήσει ο χρήστης, και περιττά context items.

### FF-01 · Αλλαγή της global κατάστασης του OpenFeature χωρίς κλείσιμο

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Το `resolveClient` καλεί `OpenFeature.setProvider(...)` /
  `setProviderAndWait(...)` πάνω στο **process-wide singleton** του OpenFeature. Δύο Nest
  εφαρμογές ή δύο test modules στην ίδια διεργασία αντικαθιστούν η μία τον provider της
  άλλης (για το default domain). Κατά το `app.close()` δεν γίνεται `OpenFeature.close()`
  ή `clearProviders()`, οπότε providers με polling ή streaming (Unleash, Flagsmith,
  LaunchDarkly) μένουν ενεργοί.
- **Παράδειγμα:** Δύο modules που δηλώνουν provider χωρίς `domain` καταχωρίζονται στο ίδιο default OpenFeature domain.
- **Πού:** `packages/pipeline-feature-flags/src/feature-flags.module.ts`.
- **Πρόταση:** Ρητό `domain` ή consumer-owned `client` για ανεξάρτητες εφαρμογές και
  σαφές ownership του shutdown. Όχι global `OpenFeature.close()` από ένα module, γιατί
  μπορεί να κλείσει providers άλλων consumers.

### FF-02 · Pipeline attributes στο evaluation context του provider

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `baseEvaluationContext` προσθέτει το `pipeline.correlation_id` και, όταν υπάρχει tenant,
  το `pipeline.tenant_id` στο evaluation context. Με SaaS providers (LaunchDarkly,
  Flagsmith κ.λπ.) η εξωτερική μεταφορά/αποθήκευση εξαρτάται από τον provider. Ο κώδικας
  αποδεικνύει παράδοση των attributes στον client, όχι αναγκαστικά αποστολή δικτύου·
  το users-api χρησιμοποιεί `InMemoryProvider`. Τα attributes αναφέρονται ρητά στον πίνακα Targeting Context του README·
  η επίπτωση ιδιωτικότητας χρειάζεται αξιολόγηση ανά επιλεγμένο provider. Το correlation id δεν χρησιμεύει καν για targeting, όπως λέει το ίδιο το
  JSDoc.
  Επιπλέον (review2): με τις προεπιλογές του `HttpCorrelationMiddleware` το correlation ID
  μπορεί να είναι **τιμή που έστειλε ο client** χωρίς όριο (C-05). Καταλήγει έτσι αυτούσιο
  στο evaluation context ενός πιθανώς εξωτερικού provider.
- **Παράδειγμα:** Ο `InMemoryProvider` λαμβάνει tenant/correlation attributes τοπικά· για απομακρυσμένο provider πρέπει να ελεγχθεί τι μεταδίδει η συγκεκριμένη υλοποίηση.
- **Πού:** `packages/pipeline-feature-flags/src/helpers/evaluation-context.ts`.

### FF-03 · Τρία context items για μία απόφαση, και διπλοί έλεγχοι στο validate

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Τα `FEATURE_FLAG_ITEM` (enabled) και `FEATURE_FLAG_KEY_ITEM` (flag) είναι πεδία του
    `FEATURE_FLAG_DECISION_ITEM` (`decision.enabled`, `decision.flagKey`). Είναι τρία δημόσια
    symbols για την ίδια πληροφορία.
  - Στο `validate` επαναλαμβάνεται μέρος του ελέγχου «μη κενό string», αλλά οι
    κλάδοι διαφέρουν: το global pass-through επιτρέπει απουσία flag, η ρητή δήλωση
    handler όχι. Απλοποίηση πρέπει να διατηρήσει αυτή τη διάκριση.
- **Παράδειγμα:** Το `decision.flagKey` επαναλαμβάνει την τιμή του `FEATURE_FLAG_KEY_ITEM`. Τα υπάρχοντα symbols όμως είναι δημόσιο API και χρειάζονται συμβατότητα.
- **Πού:** `packages/pipeline-feature-flags/src/feature-flag.behavior.ts`.

### FF-04 · Δεν δηλώνεται σειρά σε σχέση με την εξουσιοδότηση

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το behavior μπορεί να σταματήσει την εκτέλεση (fallback ή
  `FeatureDisabledError`), αλλά το contract του δεν δηλώνει σειρά σε σχέση με το CASL,
  όπως κάνει το cache. Αν μπει πριν από το `CaslBehavior`, ένας μη εξουσιοδοτημένος χρήστης
  μαθαίνει ποια features είναι ενεργά (404/403 vs 401), και ένα `fallback` επιστρέφει
  τιμή χωρίς καν έλεγχο τύπου. Στο users-api η σειρά είναι σωστή
  (`requires` → `featureFlag`), αλλά αυτό είναι σύμπτωση της δήλωσης, όχι κάτι που
  επιβάλλεται.
- **Παράδειγμα:** `FeatureFlag(fallback) → Casl` μπορεί να επιστρέψει fallback χωρίς να φτάσει στο CASL. Αν το fallback είναι προστατευμένο, η σειρά πρέπει να ελέγχεται.
- **Πού:** `packages/pipeline-feature-flags/src/feature-flag.behavior.ts`.

### Σύνοψη `packages/pipeline-feature-flags`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| FF-01 | Αλλαγή της global κατάστασης του OpenFeature χωρίς κλείσιμο | Συμπέρασμα διαδρομής κώδικα | Μεσαία |
| FF-02 | Pipeline attributes στο evaluation context του provider | Κίνδυνος συμβολαίου | Χαμηλή |
| FF-03 | Τρία context items για μία απόφαση, και διπλοί έλεγχοι στο validate | Αρχιτεκτονική πρόταση | Χαμηλή |
| FF-04 | Δεν δηλώνεται σειρά σε σχέση με την εξουσιοδότηση | Κίνδυνος συμβολαίου | Χαμηλή |

---

## 10. `packages/pipeline-idempotency` (`@nestjs-pipeline/idempotency`)

**Ρόλος:** αποτρέπει τη διπλή εκτέλεση ενός command και επιστρέφει την αποθηκευμένη
απόκριση. Κάθε claim έχει owner token, το payload έχει fingerprint, και η επανάληψη
(replay) δεσμεύεται στο scope εξουσιοδότησης. Υπάρχουν stores για memory, Redis και
Postgres.

**Χρήση στο users-api:** `IdempotencyModule.forRoot()` (memory store) στο
`ddd/users-api/src/infrastructure/reliability.module.ts`,
`ddd/users-api/src/common/cqrs/helpers/idempotent-operation.helper.ts`, και `idempotent(...)` στα
`create-user` και `create-role`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/idempotency test` → 126 tests, όλα
περνούν.

**Συνολική εκτίμηση:** ο πυρήνας του αλγορίθμου είναι από τα καλύτερα σημεία του
αποθετηρίου. Υπάρχει atomic claim, completion και release με owner, `replay_scope` που
κλείνει ασφαλώς, και ρητό σφάλμα όταν ο handler πέτυχε αλλά η ολοκλήρωση απέτυχε. Τα
σοβαρά προβλήματα βρίσκονται στη **χρήση** από το users-api: κλειδί ίσο με επιχειρησιακό
αναγνωριστικό, και οι περιορισμοί ενός process-local memory store. Η συμβατότητα του store είναι χρήσιμη· υπάρχει όμως παράδειγμα τεκμηρίωσης που διδάσκει ακριβώς το μοτίβο που το ίδιο
το πακέτο απαγορεύει.

### I-01 · users-api: create → delete → create μέσα σε 24 ώρες δεν κάνει τίποτα, αλλά απαντά 201

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Υψηλή
- **Περιγραφή:** Το κλειδί του `create-user` είναι
  `v1:<tenant>:<principalType>:<principalId>:user.create:<email>`. Είναι επιχειρησιακό αναγνωριστικό, όχι
  αναγνωριστικό αιτήματος, και ζει 24 ώρες ως `completed`. Η ροή είναι η εξής:
  1. `POST /users {email: a@x}` → δημιουργείται ο χρήστης `U1` και αποθηκεύεται η απόκριση.
  2. `DELETE /users/U1` → ο χρήστης διαγράφεται.
  3. `POST /users {email: a@x}` με το ίδιο payload → **replay** της απόκρισης του βήματος 1
     (ίδιο fingerprint, ίδιο scope). Ο handler **δεν** τρέχει.
  4. Ο controller κάνει `readAfterWrite(U1.id)` → ο χρήστης δεν υπάρχει → επιστρέφει `{}`
     με **HTTP 201**.

  Ο πελάτης πιστεύει ότι δημιούργησε χρήστη που δεν υπάρχει. Το ίδιο ισχύει για το
  `create-role`, με κλειδί το όνομα του ρόλου. Αν αλλάξει μόνο το `username`, το αποτέλεσμα
  είναι `422 key_reuse` αντί για το αναμενόμενο domain σφάλμα `UniqueEmail`.
- **Παράδειγμα:** Ίδιος tenant/principal/payload, create U1, delete U1 και νέο create μέσα στο TTL οδηγούν στο replay του U1 αντί σε νέο aggregate.
- **Πού:** `ddd/users-api/src/users/cqrs/commands/create-user.handler.ts`,
  `ddd/users-api/src/common/cqrs/helpers/idempotent-operation.helper.ts`,
  `ddd/users-api/src/users/controllers/users.controller.ts`.
- **Πρόταση:** Ρητή απόφαση αν το API deduplicates business objects ή client operations.
  Για νέα δημιουργία χρειάζεται νέο operation ID (π.χ. `Idempotency-Key`) και πολιτική
  υποχρεωτικής/προαιρετικής παρουσίας. Η διαγραφή παλιού record στο delete θα επέτρεπε
  σε καθυστερημένο retry να ξαναεκτελέσει την παλιά δημιουργία και δεν είναι ασφαλής
  γενική λύση. Το υπάρχον helper ήδη τεκμηριώνει το business-object TTL contract.

### I-02 · Χωρητικότητα και process-local όρια του memory idempotency store

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Το `MemoryIdempotencyStore` αρνείται **νέα** claims όταν έχει 10.000
  μη ληγμένα records. Υπάρχοντα claims/replays εξακολουθούν να διαβάζονται. Η άρνηση
  είναι σκόπιμη προστασία: eviction ενεργού claim θα επέτρεπε διπλή εκτέλεση.
  Το users-api το δηλώνει ως single-process demo backend και δεν το αντικαθιστά αυτόματα
  σε production. Αυτό περιορίζει το deployment, δεν κάνει λανθασμένο τον memory adapter.
  Σε replicas παραμένει τοπικό deduplication, όχι κοινή εγγύηση μεταξύ διεργασιών.
- **Αναπαραγωγή** (εκτελέστηκε): Store με `maxEntries: 1`, ενεργό κλειδί `a` και νέο
  claim `b` → σφάλμα capacity· `get('a')` εξακολουθεί να επιστρέφει το record.
- **Πού:** `packages/pipeline-idempotency/src/stores/memory.store.ts`,
  `packages/pipeline-idempotency/src/idempotency.module.ts`,
  `ddd/users-api/src/infrastructure/reliability.module.ts`.
- **Πρόταση:** Για production που απαιτεί κοινά claims, ρητό Redis/Postgres backend και
  capacity monitoring. Να κλείνει ο timer από τον ιδιοκτήτη του store· έχει `unref()`,
  άρα δεν κρατά μόνος του τη διεργασία ζωντανή.

### I-03 · Το JSDoc διδάσκει το μοτίβο κλειδιού που απαγορεύει το ίδιο το πακέτο

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Το παράδειγμα στο `IdempotencyBehaviorOptions` φτιάχνει το κλειδί με
  template string:
  ```ts
  keyFactory: (ctx) => {
    const command = ctx.request as CreateUserCommand;
    return `${ctx.tenantId}:${command.sessionUser?.id}:user.create:${command.email}`;
  },
  ```
  Όταν λείπει το tenant ή ο χρήστης, το κλειδί γίνεται `"undefined:undefined:…"`, δηλαδή
  **κοινός χώρος ονομάτων για όλους**. Επίσης δεν γίνεται escape το `:`. Είναι ακριβώς το
  σφάλμα που αποτρέπουν το `createPartitionedIdempotencyKeyFactory` και το
  `joinKeySegments` του ίδιου πακέτου, και παραβιάζει τον κανόνα 5 («never silently fall
  back to shared namespaces»).
- **Παράδειγμα:** Η απουσία tenant/principal στο template παράγει literal `undefined:undefined:…`, αντί να διακόψει τη δημιουργία security-sensitive key.
- **Πού:** `packages/pipeline-idempotency/src/interfaces/idempotency-options.interface.ts`.

### I-04 · Διαχειριστικό store API και runtime έλεγχος απαιτούμενων δυνατοτήτων

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Τα `set`/`delete` είναι τεκμηριωμένες διαχειριστικές λειτουργίες,
  ανεξάρτητες από το atomic owner-aware path του behavior. Το προαιρετικό `claimId`
  επιτρέπει ανάγνωση αποθηκευμένων records χωρίς owner· δεν πρέπει να επιτρέπει
  ανεξέλεγκτη ολοκλήρωση/διαγραφή τους. Ο runtime έλεγχος `completeIfOwned`/`deleteIfOwned`
  προστατεύει JavaScript/custom adapters, όπου ο TypeScript τύπος δεν επιβάλλεται.
- **Παράδειγμα:** Custom store που επιστρέφεται από JavaScript factory χωρίς
  `completeIfOwned` απορρίπτεται αμέσως αντί να αποτύχει μετά το business commit.
- **Πού:** `packages/pipeline-idempotency/src/interfaces/idempotency-record.interface.ts`,
  `packages/pipeline-idempotency/src/interfaces/idempotency-store.interface.ts`,
  `packages/pipeline-idempotency/src/idempotency.behavior.ts`.
- **Πρόταση:** Αν το administrative surface επιβαρύνει πραγματικούς adapters, εξετάζεται
  διάσπαση interfaces με συμβατότητα. Δεν αφαιρείται επειδή το behavior δεν το καλεί.

### I-05 · Ο τύπος της απόκρισης αλλάζει σε replay, και ένα `undefined` scope εμποδίζει replay μέχρι το TTL

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Στην πρώτη εκτέλεση επιστρέφεται το πραγματικό αντικείμενο (στο users-api το aggregate
    `User`). Σε replay επιστρέφεται το JSON snapshot του. Ο controller δηλώνει
    `execute<CreateUserCommand, User>` αλλά σε replay λαμβάνει απλό αντικείμενο. Λειτουργεί
    μόνο επειδή διαβάζει μόνο το `id`. Επιπλέον το store κρατά ολόκληρο το `User.toJSON()`
    (email κ.λπ.) για 24 ώρες, παρότι δεν σερβίρεται ποτέ.
  - Αν το `replayScopeFactory` επιστρέψει `undefined`, το record αποθηκεύεται χωρίς scope,
    και από εκεί και πέρα **κάθε** επανάληψη, ακόμη και του ίδιου χρήστη, απορρίπτεται με
    `replay_scope` μέχρι να λήξει το TTL. Αυτό είναι fail-closed σχεδίαση, όχι λόγος
    διαγραφής του claim· όταν το scope είναι υποχρεωτικό, η factory πρέπει να ρίχνει
    πριν από το claim, όπως κάνει το users-api.
- **Παράδειγμα:** Το αρχικό `User` έχει domain methods· το replayed JSON object έχει μόνο δεδομένα. Consumer που καλεί domain method στο αποτέλεσμα δεν είναι ασφαλής και στις δύο διαδρομές.
- **Πού:** `packages/pipeline-idempotency/src/idempotency.behavior.ts`,
  `ddd/users-api/src/users/controllers/users.controller.ts`.

### I-06 · Τέσσερα ονόματα για την ίδια έννοια («ποια είδη αιτημάτων»)

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Για το ίδιο φίλτρο κάθε πακέτο χρησιμοποιεί άλλο όνομα και άλλες τιμές:
  `scope: 'commands'|'queries'|'events'|'all'` (core), `kinds` (cache), `captureKinds`
  (audit, deadletter), `scope: IdempotencyRequestKind[]` (idempotency). Στο idempotency το
  `scope` συνυπάρχει με το άσχετο `replayScope`, που σημαίνει κάτι εντελώς διαφορετικό.
  Επίσης το `IdempotencyConflictError` (ουδέτερο ως προς το transport) φέρει `statusCode`
  HTTP.
- **Παράδειγμα:** `scope: ['command']` επιλέγει request kinds, ενώ `replayScopeFactory` υπολογίζει authorization digest· το ίδιο ουσιαστικό έχει διαφορετική σημασία.
- **Πού:** `packages/pipeline/src/options/global-behaviors.options.ts`,
  `packages/pipeline-cache/src/interfaces/cache-options.interface.ts`,
  `packages/pipeline-audit/src/interfaces/audit-options.interface.ts`,
  `packages/pipeline-idempotency/src/interfaces/idempotency-options.interface.ts`,
  `packages/pipeline-idempotency/src/errors/idempotency-conflict.error.ts`.

### I-07 · Τα όρια του «exactly-once»: λήξη TTL κατά την εκτέλεση και release μετά από μερικό side effect

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Προέλευση:** review2, επαληθεύτηκε στον κώδικα και στο README.
- **Περιγραφή:**
  - Το claim είναι lease με TTL. Αν ο handler τρέχει περισσότερο από το `ttl`, ένα νέο αίτημα
    με το ίδιο κλειδί παίρνει claim και εκτελεί **παράλληλα** το ίδιο side effect. Το `claimId`
    εμποδίζει μόνο την αντικατάσταση του record από την παλιά εκτέλεση, όχι τη δεύτερη
    εκτέλεση. Το README περιγράφει την προστασία του record, αλλά όχι αυτό το όριο.
  - Με το προεπιλεγμένο `releaseOnError: true`, ένας handler που έκανε εξωτερικό side effect
    και **μετά** απέτυχε απελευθερώνει το κλειδί, και το retry επαναλαμβάνει το side effect.
    Το JSDoc του option λέει «so the client can **safely** retry». Αυτό ισχύει μόνο για
    handlers χωρίς μερικά side effects.
  - Η δέσμευση της επανάληψης στο scope εξουσιοδότησης είναι opt-in (`replayScopeFactory`).
    Χωρίς αυτό, η επανάληψη ελέγχεται μόνο με κλειδί και fingerprint. Το JSDoc το λέει ρητά·
    το users-api το ενεργοποιεί.
- **Παράδειγμα:** Με `ttl: 5_000` και πληρωμή που διαρκεί 8 s, δεύτερο αίτημα στα 6 s εκτελεί
  δεύτερη πληρωμή.
- **Πού:** `packages/pipeline-idempotency/src/idempotency.behavior.ts`,
  `packages/pipeline-idempotency/src/interfaces/idempotency-options.interface.ts`
  (`ttl`, `releaseOnError`), `packages/pipeline-idempotency/README.md`.
- **Πρόταση:** Τεκμηρίωση ότι το TTL πρέπει να υπερβαίνει τη μέγιστη διάρκεια εκτέλεσης, και
  διόρθωση του «safely» στο JSDoc του `releaseOnError`.

### Σύνοψη `packages/pipeline-idempotency`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| I-01 | users-api: create → delete → create μέσα σε 24 ώρες δεν κάνει τίποτα, αλλά απαντά 201 | Συμπέρασμα διαδρομής κώδικα | Υψηλή |
| I-02 | Χωρητικότητα και process-local όρια του memory idempotency store | Κίνδυνος συμβολαίου | Μεσαία |
| I-03 | Το JSDoc διδάσκει το μοτίβο κλειδιού που απαγορεύει το ίδιο το πακέτο | Κίνδυνος συμβολαίου | Μεσαία |
| I-04 | Διαχειριστικό store API και runtime έλεγχος απαιτούμενων δυνατοτήτων | Αρχιτεκτονική πρόταση | Χαμηλή |
| I-05 | Ο τύπος της απόκρισης αλλάζει σε replay, και ένα `undefined` scope εμποδίζει replay μέχρι το TTL | Κίνδυνος συμβολαίου | Χαμηλή |
| I-06 | Τέσσερα ονόματα για την ίδια έννοια («ποια είδη αιτημάτων») | Αρχιτεκτονική πρόταση | Χαμηλή |
| I-07 | Λήξη TTL κατά την εκτέλεση, release μετά από μερικό side effect | Κίνδυνος συμβολαίου | Χαμηλή |

---

## 11. `packages/pipeline-rate-limit` (`@nestjs-pipeline/rate-limit`)

**Ρόλος:** κατανάλωση πόντων από `rate-limiter-flexible` πριν από τον handler, με κλειδιά
χωρισμένα ανά tenant και caller (`createPartitionedRateLimitKeyFactory`), και filter για
429 με `Retry-After`.

**Χρήση στο users-api:** `RateLimitModule.forRoot({ limiter: new RateLimiterMemory({ points: 5,
duration: 60 }) })` στο `reliability.module.ts:74-79`, και `rateLimit(...)` στα
`create-auth`, `refresh-auth` και `create-user`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/rate-limit test` → 52 tests, όλα περνούν.

**Συνολική εκτίμηση:** η σχεδίαση του κλειδιού είναι σωστή: δεν υπάρχει προεπιλεγμένος κοινός
bucket, και κλείνει ασφαλώς όταν λείπει tenant ή caller. Τα κύρια προβλήματα είναι η
επιλογή κλειδιών στο users-api (λάθος διάσταση για προστασία από brute force) και το ότι
ένας limiter στη μνήμη εξυπηρετεί όλες τις χρήσεις, και σε production.

### RL-01 · users-api: rate limit ανά στόχο αντί ανά πηγή (login και create-user)

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:**
  - **Login** (`create-auth`): το κλειδί είναι το email που **δηλώνει ο καλών**. Όπως λέει
    το σχόλιο, αυτό προστατεύει ένα λογαριασμό από brute force. Όμως:
    1. **password spraying** (ένας κωδικός δοκιμάζεται σε χιλιάδες emails) δεν
       περιορίζεται καθόλου, γιατί κάθε email έχει δικό του bucket·
    2. οποιοσδήποτε μπορεί να **κλειδώσει τον λογαριασμό ενός θύματος** στέλνοντας 5
       λάθος προσπάθειες ανά λεπτό με το email του (account-lockout DoS).

    Δεν υπάρχει δεύτερο όριο ανά IP. Το `refresh-auth` ήδη χρησιμοποιεί `clientIp`, άρα το
    μοτίβο υπάρχει στην εφαρμογή.
  - **Create user**: το κλειδί είναι το email του **νέου** χρήστη. Ένας διαχειριστής μπορεί
    να δημιουργήσει απεριόριστους χρήστες με διαφορετικά emails. Το όριο πιάνει μόνο
    επαναλήψεις του ίδιου email, που ήδη καλύπτει το idempotency (I-01).
- **Παράδειγμα:** Προσπάθειες login σε διαφορετικά emails καταναλώνουν διαφορετικά buckets, παρότι προέρχονται από την ίδια πηγή.
- **Πού:** `ddd/users-api/src/auths/cqrs/commands/create-auth.handler.ts`,
  `ddd/users-api/src/users/cqrs/commands/create-user.handler.ts`,
  `ddd/users-api/src/auths/cqrs/commands/refresh-auth.handler.ts`.

### RL-02 · users-api: ένας limiter στη μνήμη (5/λεπτό) για όλα, και σε production

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Υπάρχει ένα μόνο `RateLimiterMemory({ points: 5, duration: 60 })` για
  login, refresh και create-user. Δεν αλλάζει backend σε production, αντίθετα με το cache,
  παρότι το σχόλιο λέει «For multi-replica production deployments, replace with
  RateLimiterRedis». Επομένως:
  - με N replicas, το πραγματικό όριο είναι 5·N/λεπτό και εξαρτάται από τον load balancer·
  - 5 refresh ανά λεπτό ανά IP είναι πολύ αυστηρό για χρήστες πίσω από NAT (γραφείο): ένα
    κοινό IP μπλοκάρει όλους·
  - η ίδια χωρητικότητα ισχύει για τρεις εντελώς διαφορετικούς κινδύνους.

  Το πακέτο υποστηρίζει ήδη `limiter` ανά handler, αλλά το users-api δεν το χρησιμοποιεί.
- **Παράδειγμα:** Έξι refresh requests από διαφορετικούς χρήστες πίσω από ένα NAT μπορούν να υπερβούν το κοινό IP bucket των 5/λεπτό.
- **Πού:** `ddd/users-api/src/infrastructure/reliability.module.ts`.

### RL-03 · Fail-open προεπιλογή και πολιτική προστασίας του login

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `failOpen` είναι `true` από προεπιλογή. Αν πέσει το Redis, κάθε όριο,
  και το όριο brute force του login, γίνεται απλώς `warn` στο log. Για όρια ασφαλείας, χρειάζεται ρητή πολιτική της εφαρμογής. Ο κανόνας 5 του
  `AGENTS.md` αφορά κυρίως την απουσία security context στα keys και δεν επιβάλλει
  καθολικά fail-closed σε κάθε outage backend. Η προεπιλογή θα έπρεπε να
  διαφέρει ανά χρήση, ή τουλάχιστον να τεκμηριώνεται η επίπτωση στο login.
- **Παράδειγμα:** Αποτυχία distributed limiter με `failOpen: true` επιτρέπει το `next()`· το πραγματικό users-api backend είναι memory, άρα το Redis outage είναι σενάριο άλλης εγκατάστασης.
- **Πού:** `packages/pipeline-rate-limit/src/rate-limit.behavior.ts`,
  `packages/pipeline-rate-limit/src/interfaces/rate-limit-options.interface.ts`.

### RL-04 · Κοινά module/filter patterns με διαφορετικά contracts

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `RateLimitModule` επαναλαμβάνει τον ίδιο σκελετό με άλλα πέντε πακέτα:
  `forRoot`/`forRootAsync`, token για backend, token για `*_DEFAULT_OPTIONS`, `exports` τα
  ίδια τρία, και constructor με `@Optional() @Inject(LOGGING_BEHAVIOR_LOGGER)` και
  `new Logger(...)`. Επαναλαμβάνει επίσης το ίδιο `resolveEffectiveOptions` (βλ. P-02)
  και το ίδιο filter με `json`/`send` fallback για Express/Fastify (ίδιο και στα zod,
  idempotency). Αυτό δεν δικαιολογεί αυτόματα `createBehaviorModule(...)`: cache και
  feature-flags δεν έχουν καν `forRootAsync`, και το lifecycle/ownership διαφέρει.
  Κοινό helper εξετάζεται μόνο για πραγματικά ίδιες transport απαντήσεις με διατήρηση
  headers και status, όχι για γενική ενοποίηση όλων των modules.
- **Παράδειγμα:** Το rate-limit HTTP filter πρέπει να κρατήσει `Retry-After` ακόμη και αν μοιραστεί τον κώδικα `json`/`send` με άλλο filter.
- **Πού:** `packages/pipeline-rate-limit/src/rate-limit.module.ts`,
  `packages/pipeline-rate-limit/src/rate-limit.behavior.ts`, `packages/pipeline-rate-limit/src/filters/rate-limit-exceeded.filter.ts`·
  αντίστοιχα αρχεία στα `pipeline-audit`, `pipeline-deadletter`, `pipeline-idempotency`,
  `pipeline-zod`.

### Σύνοψη `packages/pipeline-rate-limit`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| RL-01 | users-api: rate limit ανά στόχο αντί ανά πηγή (login και create-user) | Συμπέρασμα διαδρομής κώδικα | Μεσαία |
| RL-02 | users-api: ένας limiter στη μνήμη (5/λεπτό) για όλα, και σε production | Συμπέρασμα διαδρομής κώδικα | Μεσαία |
| RL-03 | Fail-open προεπιλογή και πολιτική προστασίας του login | Κίνδυνος συμβολαίου | Χαμηλή |
| RL-04 | Κοινά module/filter patterns με διαφορετικά contracts | Αρχιτεκτονική πρόταση | Χαμηλή |

---

## 12. `packages/pipeline-resilience` (`@nestjs-pipeline/resilience`)

**Ρόλος:** τυλίγει ολόκληρο τον handler σε πολιτική Cockatiel (retry, circuit breaker,
timeout, bulkhead, fallback). Η πολιτική κρατιέται ανά handler, και υπάρχει AbortSignal
μέσω `AsyncLocalStorage`.

**Χρήση στο users-api:** `ResilienceModule.forRoot()` στο `ddd/users-api/src/infrastructure/reliability.module.ts`, και
`resilience({ handle: isTransientOperationError, retry: { replaySafe: true, … } })` στα
`delete-user` και `delete-role`.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/resilience test` → 47 tests, όλα περνούν.

**Συνολική εκτίμηση:** το μοντέλο ασφάλειας είναι σωστό: το retry σε commands απαιτεί ρητό
`replaySafe`, και retry, breaker και fallback απαιτούν ταξινόμηση σφαλμάτων. Όμως η
επικύρωση bootstrap/runtime υπηρετεί διαφορετικά επίπεδα ασφάλειας. Το `aggressive` timeout ως
προεπιλογή είναι επικίνδυνο για commands, και υπάρχουν πάλι JSDoc σε λάθος σημείο και
σχόλια ιστορικού.

### R-01 · Bootstrap diagnostics και runtime safety είναι διαφορετικά συμβόλαια

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `diagnostics: 'warn' | 'off'` τεκμηριώνεται ρητά ως ρύθμιση
  **bootstrap**. Δεν υπόσχεται εκτέλεση επικίνδυνου retry χωρίς `replaySafe` ή error
  classifier. Η κοινή `getResilienceSafetyIssues` χρησιμοποιείται σε bootstrap και runtime,
  άρα επαναλαμβάνεται η αξιολόγηση, όχι ο ορισμός των κανόνων. Ο runtime έλεγχος καλύπτει
  και direct/scoped χρήση χωρίς διαθέσιμο singleton στο bootstrap.
- **Παράδειγμα:** Με `diagnostics: 'off'` η εφαρμογή ξεκινά, αλλά retry command χωρίς
  `retry.replaySafe: true` απορρίπτεται στην πρώτη κλήση. Αυτό συμφωνεί με το contract.
- **Πού:** `packages/pipeline-resilience/src/resilience.behavior.ts`,
  `packages/pipeline/src/options/pipeline-module.options.ts`.
- **Πρόταση:** Ρητή σύνδεση των δύο επιπέδων στην τεκμηρίωση. Διατήρηση runtime safety.

### R-02 · Το `aggressive` timeout ως προεπιλογή, σε commands, μαζί με idempotency

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Η προεπιλογή του timeout είναι `aggressive`: ο καλών παίρνει
  `TaskCancelledError` αμέσως, ενώ ο handler **συνεχίζει** να τρέχει και μπορεί να κάνει
  commit. Για commands αυτό δεν ζητά καμία επιβεβαίωση (το `replaySafe` αφορά μόνο το
  retry). Όταν το idempotency είναι **έξω** από το resilience, σε συνδυασμό με
  `IdempotencyBehavior` (`releaseOnError: true` από
  προεπιλογή):
  1. το timeout ρίχνει σφάλμα, οπότε το idempotency **απελευθερώνει** το claim·
  2. ο πελάτης ξαναστέλνει, και το idempotency δίνει νέο claim·
  3. η πρώτη εκτέλεση ακόμη τρέχει, οπότε το ίδιο side effect γίνεται **δύο φορές**.

  Με αντίστροφη σειρά η εξέλιξη του claim διαφέρει· δεν ισχύει για κάθε composition.
  Ο κίνδυνος υπάρχει και **χωρίς** idempotency (review2): στην προεπιλεγμένη σειρά
  `fallback → retry → circuitBreaker → bulkhead → timeout` το retry είναι έξω από το timeout.
  Μετά από aggressive timeout ξεκινά νέα προσπάθεια ενώ η προηγούμενη συνεχίζει, οπότε δύο
  εκτελέσεις του ίδιου handler επικαλύπτονται μέσα στο ίδιο αίτημα.
  Το σενάριο δεν είναι τωρινό users-api flow: τα delete handlers έχουν retry και τα
  create handlers idempotency, χωρίς αυτόν τον συνδυασμό timeout. Ένα εξωτερικό
  `DeadLetterBehavior` μπορεί επίσης να καταγράψει timeout ενώ το underlying effect ολοκληρώνεται.
- **Παράδειγμα:** `Idempotency → aggressive timeout → μη ακυρώσιμο write`: ο caller παίρνει timeout, το claim απελευθερώνεται και το αρχικό write μπορεί να ολοκληρωθεί παράλληλα με νέο retry.
- **Πού:** `packages/pipeline-resilience/src/helpers/policy-factory.ts`,
  `packages/pipeline-resilience/src/interfaces/resilience-options.interface.ts`,
  `packages/pipeline-idempotency/src/idempotency.behavior.ts`.
- **Πρόταση:** `cooperative` ως προεπιλογή, ή διάγνωση στο bootstrap για `aggressive`
  timeout σε commands, όπως γίνεται για το retry.

### R-03 · Το JSDoc της κλάσης είναι κολλημένο σε ιδιωτικό interface

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το JSDoc 30 γραμμών του `ResilienceBehavior` (πριν από το `ResilienceSafetyIssue`) ακολουθείται από το
  `interface ResilienceSafetyIssue` και τη συνάρτηση `getResilienceSafetyIssues`. Έτσι ανήκει
  στο ιδιωτικό interface και το `ResilienceBehavior` στο `.d.ts` δεν έχει τεκμηρίωση. Είναι
  το ίδιο δομικό πρόβλημα με το O-02 στο `MetricsBehavior`· η προέλευση της αλλαγής
  δεν αποδεικνύεται από το αποτέλεσμα.
- **Παράδειγμα:** Η περιγραφή του `ResilienceBehavior` προηγείται του `interface ResilienceSafetyIssue`, αντί να βρίσκεται δίπλα στην κλάση που περιγράφει.
- **Πού:** `packages/pipeline-resilience/src/resilience.behavior.ts`.

### R-04 · Σχόλια ιστορικού

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  ```ts
  // Policies are cached per handler … which is correct. What was not correct was
  // baking the *first* request's name into the policy's telemetry callbacks …
  ```
  ```ts
  // baking the first request's name in made a multi-event handler report the
  // wrong event forever.
  ```
  Είναι αφήγηση ενός σφάλματος που διορθώθηκε, και ανήκει στο git history.
- **Παράδειγμα:** Το σχόλιο «baking the first request's name in made…» πρέπει να αντικατασταθεί από το σημερινό contract των request-local labels.
- **Πού:** `packages/pipeline-resilience/src/helpers/resilience-context.ts`,
  `packages/pipeline-resilience/src/helpers/policy-factory.ts`.

### R-05 · users-api: το retry ενός delete μπορεί να αναφέρει 404 για επιτυχημένη διαγραφή

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `delete-user`/`delete-role` κάνει retry στα transient σφάλματα
  (`replaySafe: true`). Αν η πρώτη προσπάθεια κάνει commit και η σύνδεση κοπεί πριν από
  την επιβεβαίωση, το retry βρίσκει `findById → null` και ρίχνει `EntityNotFoundException`.
  Ο πελάτης βλέπει 404 για διαγραφή που έγινε. Το «replay-safe» ισχύει για την ακεραιότητα
  των δεδομένων, όχι για την απόκριση προς τον πελάτη.
- **Παράδειγμα:** Commit delete με χαμένη επιβεβαίωση και transient error μπορεί να οδηγήσει σε retry του οποίου το authoritative load επιστρέφει `null`.
- **Πού:** `ddd/users-api/src/users/cqrs/commands/delete-user.handler.ts`.

### R-06 · Το fallback επιτρέπεται σε commands/events χωρίς ρητή επιβεβαίωση

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Προέλευση:** review2, επαληθεύτηκε στον κώδικα.
- **Περιγραφή:** Το `getResilienceSafetyIssues` ζητά για το `fallback` μόνο ταξινόμηση
  σφαλμάτων (`handle` ή `handleAllErrors`). Για το retry σε commands/events απαιτεί επιπλέον
  `replaySafe`, αλλά για το fallback δεν υπάρχει αντίστοιχη απαίτηση. Ένα fallback σε command
  μετατρέπει την αποτυχία σε «επιτυχημένη» τιμή: τα εξωτερικά behaviors (audit, dead letter,
  idempotency completion) βλέπουν επιτυχία, ενώ το side effect δεν έγινε ή έγινε μερικώς.
- **Παράδειγμα:** `resilience({ fallback: { value: null }, handleAllErrors: true })` σε command
  handler περνά το bootstrap. Το idempotency αποθηκεύει το `null` ως ολοκληρωμένη απόκριση.
- **Πού:** `packages/pipeline-resilience/src/resilience.behavior.ts`
  (`getResilienceSafetyIssues`), `packages/pipeline-resilience/src/helpers/policy-factory.ts`
  (`buildFallback`).
- **Πρόταση:** Διάγνωση στο bootstrap για fallback σε non-query handlers, με ρητό opt-in όπως
  το `replaySafe`.

### Σύνοψη `packages/pipeline-resilience`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| R-01 | Bootstrap diagnostics και runtime safety είναι διαφορετικά συμβόλαια | Αρχιτεκτονική πρόταση | Χαμηλή |
| R-02 | Το `aggressive` timeout ως προεπιλογή, σε commands, μαζί με idempotency | Κίνδυνος συμβολαίου | Μεσαία |
| R-03 | Το JSDoc της κλάσης είναι κολλημένο σε ιδιωτικό interface | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| R-04 | Σχόλια ιστορικού | Αρχιτεκτονική πρόταση | Χαμηλή |
| R-05 | users-api: το retry ενός delete μπορεί να αναφέρει 404 για επιτυχημένη διαγραφή | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| R-06 | Το fallback επιτρέπεται σε commands/events χωρίς ρητή επιβεβαίωση | Κίνδυνος συμβολαίου | Χαμηλή |

---

## 13. `ddd/core` (`@nestjs-pipeline/ddd-core`)

**Ρόλος:** τα θεμέλια DDD. Περιλαμβάνει `AggregateRoot`/`RootEntity`, domain events και
exceptions, `@Mutable`/`@ApplyMutation`, `BaseCommand`/`BaseQuery`/`CommandBaseHandler`,
συμβόλαια repository, τους decorators κύκλου ζωής (`@Cache`, `@FromCache`,
`@AcknowledgePersisted`, `@MapPersistenceErrors`, `@PersistedWrite`), τα `optimisticUpdate`/
`optimisticDelete` και το `MemoryCache`.

**Χρήση στο users-api:** όλα τα aggregates (`User`, `Role`, `Auth`, `Capability`), όλοι οι
command handlers και όλα τα repositories.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/ddd-core test` → 359 tests, όλα περνούν.
`lint` → χωρίς σφάλματα.

**Συνολική εκτίμηση:** ο πυρήνας του persistence lifecycle (έκδοση που προχωρά μόνο μετά από
επιτυχημένη εγγραφή, delete/update με έλεγχο έκδοσης, revision-fenced fill) είναι σωστή
μηχανική. Το πακέτο όμως έχει τρία είδη προβλημάτων:
- Διατηρεί revision fencing και barrier interoperability που χρειάζονται ακριβή τεκμηρίωση.
- Διαθέτει reusable Nest-style hooks που απαιτούν σαφή χρήση του event lifecycle.
- Έχει **αναπαραγόμενα ABA** στο `MemoryCache` και unfenced fallback στο write-through.

Επιπλέον οι κανόνες του lifecycle επαναλαμβάνονται σε πολλά σημεία της τεκμηρίωσης (βλ. X-01).

### D-01 · Το `MemoryCache` χάνει το revision fence σε eviction (ABA)

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα · **Σοβαρότητα:** Υψηλή
- **Περιγραφή:** Το JSDoc λέει «Bounds active payload capacity separately from coordination
  metadata», αλλά το `evict()` διαγράφει **οποιοδήποτε** entry με σειρά εισαγωγής, μαζί και
  τα entries που κρατούν μόνο revision (`hasValue: false`) μετά από `invalidate`. Όταν
  σβηστεί ένα τέτοιο entry, το revision του κλειδιού επιστρέφει σε `'0'`. Ένας reader που
  είχε δει `'0'` πριν από το delete κάνει τότε **επιτυχημένο** `tryFill` με stale snapshot.
  Είναι ακριβώς το σενάριο «anti-resurrection» που οι κανόνες 17-18 του `AGENTS.md` ζητούν να
  αποτρέπεται.
- **Αναπαραγωγή** (εκτελέστηκε με προσωρινό spec, που αφαιρέθηκε μετά):
  ```ts
  const cache = new MemoryCache<{ v: number }>({ maxEntries: 1 });
  const observed = await cache.readState('user:1');  // rev '0'
  await cache.invalidate('user:1');                  // delete → rev 1
  await cache.set('user:2', { v: 2 });               // πάνω από το όριο → evict('user:1')
  await cache.tryFill('user:1', observed.revision, { v: 1 }); // → true (stale fill)
  ```
- **Πού:** `ddd/core/persistence/cache/memory.cache.ts`.
- **Πρόταση:** Να διατηρείται revision/tombstone ανεξάρτητα από payload eviction ή να
  χρησιμοποιείται epoch που αλλάζει και την ταυτότητα της απουσίας. Ένας global counter
  **μόνο στις εγγραφές** δεν αρκεί όσο absent keys επιστρέφουν πάντα `'0'`. Η λύση
  πρέπει να καλύπτει eviction, expiry, delete/recreate και `clear()` (D-09).

### D-02 · Συνύπαρξη revision fencing και barrier compatibility

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Οι versioned adapters χρησιμοποιούν revisions, οι unversioned writes
  χρησιμοποιούν barrier sentinels και το `@FromCache` παρακάμπτει unversioned adapters.
  Ωστόσο versioned reader μπορεί να μοιράζεται store με unversioned writer και ελέγχει
  ρητά `isCacheMutationBarrier`. Άρα ο ισχυρισμός «barrier χωρίς κανέναν αναγνώστη» είναι
  ανακριβής. Τα `isNewer`/`__gen` είναι επίσης reusable συγκρίσεις, όχι αποκλειστικά
  υπόλοιπα του barrier protocol.
- **Παράδειγμα:** Versioned `readState()` που επιστρέφει sentinel αντιμετωπίζεται ως
  miss, ώστε το sentinel να μη δοθεί στον hydrator ως aggregate snapshot.
- **Πού:** `ddd/core/persistence/decorators/Cache.ts`,
  `ddd/core/persistence/decorators/FromCache.ts`,
  `ddd/core/persistence/helpers/cache-version.helper.ts`,
  `ddd/core/persistence/cache.interface.ts`.
- **Πρόταση:** Τεκμηρίωση πίνακα δυνατοτήτων ανά adapter και διόρθωση του γενικού
  σχολίου ότι το `FromCache` διαβάζει το unversioned path. Διατήρηση των συμβολαίων
  barrier/versioning· δεν προτείνεται κατάργηση μηχανισμού για να απλοποιηθεί το review.

### D-03 · Κρυφή σύζευξη μέσω `this.cache` / `this.hydration` και σιωπηλή απενεργοποίηση

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Οι decorators διαβάζουν `this.cache` και `this.hydration` με βάση το όνομα
  της ιδιότητας. Αν ένα repository δεν κληρονομεί από `CommandRepository`/`QueryRepository`, ή
  ονομάσει το πεδίο αλλιώς, τότε `if (!this.cache) return result`: η εγγραφή περνά,
  αλλά **δεν γίνεται κανένα eviction/invalidate**, οπότε μένει stale cache μετά από delete,
  χωρίς κανένα σφάλμα ή log. Επιπλέον, η σημασία «`save()` που επιστρέφει `null` = delete» είναι
  σιωπηρό πρωτόκολλο: ένα create repository που επιστρέψει κατά λάθος `null` ενεργοποιεί
  eviction μόνο εφόσον έχουν ρυθμιστεί `deleteKeys`. Ο optional cache και η σημασία
  nullish αποτελέσματος τεκμηριώνονται στο API· ο κίνδυνος είναι λάθος wiring σε consumer
  που βασίζεται σε κοινό cache, όχι ότι κάθε repository χωρίς cache είναι ελαττωματικό.
  Γενικότερα (review2): ένα `save()` λίγων γραμμών κρύβει πίσω από decorators version
  acknowledgement, cache maintenance, barriers/fences και error translation. Η ορθότητα
  εξαρτάται από τη σωστή σύνθεση decorators και helpers (`optimisticUpdate`), κάτι που
  φαίνεται μόνο διαβάζοντας τον ορισμό των decorators.
- **Παράδειγμα:** Repository με `cacheClient` αντί για την αναμενόμενη `cache` παραλείπει cache maintenance. Το optional-cache contract χρειάζεται σαφή χρήση όταν άλλοι readers μοιράζονται cached state.
- **Πού:** `ddd/core/persistence/decorators/Cache.ts`,
  `ddd/core/persistence/decorators/FromCache.ts`, `ddd/core/persistence/command-repository.interface.ts`.

### D-04 · Το `@FromCache` μπορεί να επιστρέψει snapshot με τύπο aggregate

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Ο κανόνας 15 λέει ότι τα query repositories επιστρέφουν **αυστηρά** domain
  aggregates. Όμως όταν ένα method δηλώνει `hydrateFn` χωρίς `alwaysHydrate`, ή δεν υπάρχει
  hydration policy, τότε ένα hit με `query.hydrate = false` επιστρέφει το **ακατέργαστο
  snapshot** ως `TResult` (`cachedValue as unknown as TResult`). Ένα miss όμως επιστρέφει
  το aggregate. Υπάρχουν λοιπόν δύο τύποι πίσω από τον ίδιο στατικό τύπο, το ίδιο πρόβλημα
  με το CA-01 σε άλλο επίπεδο. Το users-api το αποφεύγει μόνο επειδή χρησιμοποιεί
  repository-wide hydration.
- **Παράδειγμα:** Method με `hydrateFn: User.fromJSON`, χωρίς `alwaysHydrate`, και query `{ hydrate: false }` μπορεί να δώσει raw snapshot σε hit και aggregate σε miss.
- **Πού:** `ddd/core/persistence/decorators/FromCache.ts`,
  `ddd/core/application/query.options.ts`.

### D-05 · Το `AggregateRoot.commit()` χρειάζεται συνδεδεμένο publisher

- **Κατηγορία:** Κίνδυνος συμβολαίου · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Η owned, framework-neutral βάση διατηρεί σκόπιμα Nest-style hooks
  `publish`/`publishAll`, buffering και ιστορική αναπαραγωγή. Χωρίς override/σύνδεση
  publisher, το `commit()` καλεί κενό hook και αδειάζει το buffer. Το ίδιο μοτίβο
  υπάρχει στην ασύνδετη βάση Nest· δεν αποδεικνύεται ελαττωματικό αντίγραφο ή test-only API.
  Στο users-api η δημοσίευση ανήκει στο `CommandBaseHandler`. Εκεί το `publishAll()` γίνεται
  στο in-memory `EventBus` **μετά** την αποθήκευση, χωρίς transaction. Ένα crash ανάμεσα στα
  δύο χάνει τα events. Αυτό τεκμηριώνεται στο JSDoc του `execute()` και στον κανόνα 10 του
  `AGENTS.md`, άρα είναι γνωστό όριο, όχι κρυφό σφάλμα (review2). Τα `RootEntity.from()` και
  `clonePayload()` είναι τεκμηριωμένα reusable primitives, ανεξάρτητα από τοπικά call sites.
- **Παράδειγμα:** Aggregate με pending event και default `publishAll` χάνει το pending
  event από το buffer μετά από `commit()`, χωρίς αποστολή στο EventBus.
- **Πού:** `ddd/core/domain/models/aggregate-root.ts`,
  `ddd/core/application/command-base.handler.ts`, `ddd/core/README.md`.
- **Πρόταση:** Να είναι σαφής η προϋπόθεση publisher και η επιλογή lifecycle του
  consumer. Καμία αφαίρεση των hooks/rehydration/clone APIs λόγω `private: true` ή
  απουσίας χρήσης στην εφαρμογή αναφοράς.

### D-06 · Επαναλήψεις helpers και υποστηριζόμενες μορφές API

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Δεύτερη υλοποίηση του `uuidv7` (`ddd/core/domain/utils/uuidv7.ts`) πέρα από τον core.
    Το correlation κάνει re-export, όχι τρίτη υλοποίηση. Τα σώματα των `uuidv7()` και
    `isUuidV7()` είναι **αυτολεξεί ίδια** στα δύο αρχεία (επιβεβαιώθηκε με `diff`)· διαφέρει
    μόνο το JSDoc. Ο framework-neutral domain δεν πρέπει να αποκτήσει Nest dependency
    απλώς για ενοποίηση. Επομένως η επιλογή είναι μεταξύ ελεγχόμενης αντιγραφής και ενός
    μικρού dependency-free module. Το ίδιο το
    πακέτο χρησιμοποιεί το `uuidv7` του πυρήνα στο `ddd/core/persistence/helpers/cache-barrier.helper.ts`.
  - Έκτη υλοποίηση βαθιάς αντιγραφής (`deepCloneAndFreeze`, με override στα `Date`/`Map`/`Set`
    που, όπως παραδέχεται το ίδιο το JSDoc, «not a security boundary»), και έβδομη
    (`JSON.parse(JSON.stringify())` σε `MemoryCache.detach` και σε `toCacheSnapshot`).
  - Τα `BaseCommand.toJSON` και `BaseQuery.toJSON` είναι ίδιος κώδικας. Το `TSessionUser`
    είναι `any` στο ένα και `unknown` στο άλλο.
  - Τα `optimisticUpdate` και `optimisticDelete` επαναλαμβάνουν τα ίδια 15 γραμμές
    διάγνωσης για 0/>1 γραμμές.
  - Το `@Cache` και το `@FromCache` δέχονται το καθένα **τρεις** μορφές ορισμάτων (positional,
    options, mixed), με διπλό κώδικα επίλυσης. Είναι υποστηριζόμενη ευελιξία API· το review δεν έχει στοιχεία για το
    αρχικό αίτημα ή τους εξωτερικούς consumers. Η απόσυρση overloads απαιτεί συμβατότητα.
  - Το `isCacheNewer` εξάγεται και από το `ddd/core/persistence/decorators/FromCache.ts` (`export { isCacheNewer }`) και από τα
    helpers.
  - Υπάρχει νεκρή γραμμή μετά από βρόχο που πάντα επιστρέφει (`ddd/core/persistence/decorators/FromCache.ts`).
- **Παράδειγμα:** Τα `BaseCommand.toJSON()` και `BaseQuery.toJSON()` έχουν τον ίδιο βρόχο που παραλείπει undefined enumerable πεδία· αυτό είναι συγκεκριμένη μικρή επανάληψη.
- **Πού:** `ddd/core/domain/utils/uuidv7.ts`, `ddd/core/domain/events/root-domain.event.ts`,
  `ddd/core/application/base.command.ts`, `ddd/core/application/base.query.ts`,
  `ddd/core/persistence/optimistic-update.ts`, `ddd/core/persistence/optimistic-delete.ts`,
  `ddd/core/persistence/decorators/Cache.ts`, `ddd/core/persistence/decorators/FromCache.ts`.

### D-07 · Τα ports ζουν στον φάκελο persistence και το persistence διαβάζει ambient pipeline context

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Το `ddd/core/application/index.ts` εξηγεί ότι «Repository interfaces live here … because they are
    ports», αλλά τα αρχεία βρίσκονται φυσικά στο `persistence/` (`ddd/core/persistence/cache.interface.ts`,
    `ddd/core/persistence/command-repository.interface.ts` κ.λπ.) και το application barrel τα εισάγει από εκεί.
    Επίσης το `ICache`, που αφορά τον adapter, εκτίθεται ως application port.
  - Το `filterCacheKey` στο persistence βρίσκει το tenant από το **ambient**
    `pipelineStore.getStore()` του `@nestjs-pipeline/core`. Υποστηρίζει όμως ρητό τρίτο όρισμα tenant/context. Εκτός pipeline αποτυγχάνει
    όταν ο caller παραλείπει **και** το explicit tenant· δεν είναι υποχρεωτική ambient
    εξάρτηση για όλες τις χρήσεις του helper.
  - Το `MissingTenantContextError` είναι `DomainException`, άρα το `DomainExceptionFilter` το
    χαρτογραφεί ως σφάλμα πελάτη (4xx), ενώ πρόκειται για λάθος διαμόρφωσης του server.
  - Το `@nestjs-pipeline/correlation` δηλώνεται στα `dependencies` του ddd-core χωρίς να
    χρησιμοποιείται πουθενά στον κώδικα (το grep δεν βρίσκει κανένα import).
- **Παράδειγμα:** `filterCacheKey('user', { id }, 'tenant-a')` λειτουργεί χωρίς ambient pipeline, ενώ χωρίς το τρίτο όρισμα και χωρίς context ρίχνει `MissingTenantContextError`.
- **Πού:** `ddd/core/application/index.ts`,
  `ddd/core/persistence/helpers/filter-cache-key.helper.ts`,
  `ddd/core/domain/exceptions/missing-tenant-context.exception.ts`, `ddd/core/package.json`.

### D-08 · Σχόλια ιστορικού και ανάγκη σαφούς πλαισίου στα lifecycle παραδείγματα

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - `ConcurrencyConflictError`: «**Previously** they threw MikroORM's `OptimisticLockError` and
    the HTTP filter caught it by type…».
  - `isCacheNewer`: «Treating it as "not newer" **let** a write-through … resurrect the
    deleted aggregate».
  - `MissingTenantContextError`: «`AGENTS.md` rule 5 and the architecture skill's security
    checklist require…». Είναι αναφορά σε αριθμημένο κανόνα μέσα σε κώδικα, που σπάει
    μόλις αλλάξει η αρίθμηση.
  - Τα JSDoc των `AcknowledgePersisted`, `MapPersistenceErrors` και `optimisticUpdate` δείχνουν
    ως παράδειγμα τη χειροκίνητη στοίβα τριών decorators. Ο κανόνας 11 προτιμά `@PersistedWrite` για αναγνωριζόμενες εγγραφές
    με aggregate ως πρώτο όρισμα, αλλά επιτρέπει ρητά την επιμέρους στοίβα για άλλες
    υπογραφές/deletes/custom ordering. Η τεκμηρίωσή της είναι αναγκαία· χρειάζεται σαφές
    πλαίσιο χρήσης, όχι καθολική διαγραφή.
    Τα παραδείγματα χρησιμοποιούν επίσης κλειδιά `` `roles:${role.id}` `` χωρίς escape, ενώ ο
    κώδικας χρησιμοποιεί `filterCacheKey`.
  - Το μπλοκ «Canonical Decorator Ordering» υπάρχει αυτούσιο σε 2 JSDoc, και επιπλέον στα
    `AGENTS.md`, `.agents/skills/nestjs-pipeline-architecture/SKILL.md`, `ddd/core/CLAUDE.md` και `.claude/codebase-map.md` (βλ. X-01).
- **Παράδειγμα:** Το σχόλιο «Previously they threw MikroORM's OptimisticLockError» περιγράφει παρελθόν. Ο σημερινός κανόνας είναι framework-neutral concurrency errors στο persistence boundary.
- **Πού:** `ddd/core/domain/exceptions/concurrency-conflict.error.ts`,
  `ddd/core/persistence/helpers/cache-version.helper.ts`,
  `ddd/core/domain/exceptions/missing-tenant-context.exception.ts`,
  `ddd/core/persistence/decorators/acknowledge-persisted.decorator.ts`,
  `ddd/core/persistence/decorators/map-persistence-errors.decorator.ts`, `ddd/core/persistence/optimistic-update.ts`.

### D-09 · Το `MemoryCache.clear()` καταργεί τα fences ενεργών readers

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα · **Σοβαρότητα:** Υψηλή
- **Περιγραφή:** Το `clear()` αδειάζει όλο το map, μαζί με τα revisions. Reader που
  είχε παρατηρήσει απουσία πριν από invalidation μπορεί να εγκαταστήσει παλιό snapshot
  μετά το clear. Είναι ξεχωριστό trigger από την eviction του D-01 και δεν απαιτεί
  πλήρωση της χωρητικότητας.
- **Αναπαραγωγή** (εκτελέστηκε):
  ```ts
  const observed = await cache.readState('user:1'); // revision '0'
  await cache.invalidate('user:1');
  await cache.clear();
  await cache.tryFill('user:1', observed.revision, staleSnapshot); // true
  ```
- **Πού:** `ddd/core/persistence/cache/memory.cache.ts` (`readState`),
  `ddd/core/persistence/cache/memory.cache.ts` (`tryFill`),
  `ddd/core/persistence/cache/memory.cache.ts` (`clear`).
- **Πρόταση:** Το clear να αλλάζει generation/epoch που συμμετέχει σε **κάθε** token,
  ακόμη και απουσίας, ή να διατηρεί την αναγκαία coordination κατάσταση. Έλεγχος
  απόρριψης όλων των pre-clear tokens χωρίς αφαίρεση της λειτουργίας clear.

### D-10 · Αποτυχία αρχικής ανάγνωσης revision οδηγεί σε unfenced write-through

- **Κατηγορία:** Αναπαραγόμενο ελάττωμα · **Σοβαρότητα:** Υψηλή
- **Περιγραφή:** Το `@Cache` πιάνει σφάλμα της αρχικής `readState()` και αφήνει το
  `observedRevision` undefined. Μετά την επιτυχή αποθήκευση χρησιμοποιεί τον γενικό
  κλάδο `cache.set()`, ακόμη και σε versioned adapter. Αν στο μεταξύ έγινε invalidation,
  αυτός ο κλάδος παρακάμπτει το revision fence. Σύγκριση aggregate version δεν αρκεί
  όταν το invalidated entry δεν έχει payload.
- **Αναπαραγωγή** (εκτελέστηκε μέσω διακοσμημένης `save()`): Η πρώτη `readState('a')`
  ρίχνει προσωρινό cache error· πριν επιστρέψει η `save()` γίνεται `invalidate('a')`·
  το fallback `set('a', oldSnapshot)` εγκαθιστά ξανά το παλιό snapshot. Το τελικό
  `cache.get('a')` επιστρέφει την παλιά τιμή.
- **Πού:** `ddd/core/persistence/decorators/Cache.ts` (παρατήρηση/catch),
  `ddd/core/persistence/decorators/Cache.ts` (fenced branch και fallback),
  `ddd/core/persistence/cache/memory.cache.ts` (`set`).
- **Πρόταση:** Σε versioned adapter χωρίς έγκυρο αρχικό token να παραλείπεται το
  write-through, διατηρώντας την επιτυχία της βάσης και τη best-effort cache πολιτική.
  Όχι υποβάθμιση σε unfenced `set` ούτε ανάγνωση νέου token μετά το commit ως δήθεν
  απόδειξη ότι το παλιό snapshot είναι φρέσκο.

### Σύνοψη `ddd/core`

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| D-01 | Το `MemoryCache` χάνει το revision fence σε eviction (ABA) | Αναπαραγόμενο ελάττωμα | Υψηλή |
| D-02 | Συνύπαρξη revision fencing και barrier compatibility | Αρχιτεκτονική πρόταση | Χαμηλή |
| D-03 | Κρυφή σύζευξη μέσω `this.cache` / `this.hydration` και σιωπηλή απενεργοποίηση | Κίνδυνος συμβολαίου | Μεσαία |
| D-04 | Το `@FromCache` μπορεί να επιστρέψει snapshot με τύπο aggregate | Κίνδυνος συμβολαίου | Μεσαία |
| D-05 | Το `AggregateRoot.commit()` χρειάζεται συνδεδεμένο publisher | Κίνδυνος συμβολαίου | Χαμηλή |
| D-06 | Επαναλήψεις helpers και υποστηριζόμενες μορφές API | Αρχιτεκτονική πρόταση | Χαμηλή |
| D-07 | Τα ports ζουν στον φάκελο persistence και το persistence διαβάζει ambient pipeline context | Αρχιτεκτονική πρόταση | Χαμηλή |
| D-08 | Σχόλια ιστορικού και ανάγκη σαφούς πλαισίου στα lifecycle παραδείγματα | Αρχιτεκτονική πρόταση | Χαμηλή |
| D-09 | Το `MemoryCache.clear()` καταργεί τα fences ενεργών readers | Αναπαραγόμενο ελάττωμα | Υψηλή |
| D-10 | Αποτυχία αρχικής ανάγνωσης revision οδηγεί σε unfenced write-through | Αναπαραγόμενο ελάττωμα | Υψηλή |

---

## 14. `ddd/users-api` (εφαρμογή αναφοράς)

**Ρόλος:** η εφαρμογή που συνδυάζει όλα τα πακέτα. Περιλαμβάνει users, roles και auth,
multi-tenant persistence (SQLite/libSQL και PostgreSQL), BullMQ, CASL και OTel.

**Επαλήθευση:** `pnpm --filter @nestjs-pipeline/ddd-users-api test` → 105 αρχεία, 737 tests,
όλα περνούν. `pnpm lint:persistence` → 721 αρχεία, χωρίς διαγνωστικά. Τα e2e
(PostgreSQL/Redis) **δεν** εκτελέστηκαν σε αυτή την αναθεώρηση.

**Συνολική εκτίμηση:** τα όρια των layers τηρούνται. Κανένας handler δεν εισάγει ORM, και
η αναζήτηση στις CQRS/application διαδρομές δεν έδειξε άμεση ORM εξάρτηση.
Αυτό δεν σημαίνει απουσία τέτοιων imports από κάθε άλλο φάκελο: composition roots,
υποδομή και tests μπορούν νόμιμα να τα χρησιμοποιούν. Τα read/write paths είναι καλά σκεφτεμένα (π.χ. παράκαμψη cache όταν η
εξουσιοδότηση εξαρτάται από την κατάσταση της οντότητας). Τα προβλήματα της εφαρμογής που
αφορούν συγκεκριμένα πακέτα έχουν ήδη καταγραφεί στις ενότητες 1-13: P-10, C-05, C-06, C-07,
A-05, O-05, O-06, O-07, Z-06, AU-06, DL-05, RL-01, RL-02, I-01, I-02, R-05. Εδώ καταγράφονται
τα υπόλοιπα.

### U-01 · Ο demo credential adapter παραμένει κοινός κωδικός και σε production mode

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Υψηλή (αν η εφαρμογή
  τρέξει όπως είναι)
- **Περιγραφή:** Το `EnvLoginCodeVerifier` συγκρίνει τον κωδικό με **έναν** SHA-256 digest από
  το `AUTH_LOGIN_CODE_SHA256`, κοινό για **όλους** τους χρήστες όλων των tenants. Όποιος
  γνωρίζει τον κωδικό συνδέεται ως **οποιοσδήποτε** χρήστης, δίνοντας μόνο το email του. Η
  κλάση ονομάζεται «Demo credential adapter», αλλά έχει ρητό μονοπάτι για production («Production
  requires `AUTH_LOGIN_CODE_SHA256`»). Επιπλέον το JSDoc του `UserLoginService` μιλά για
  «**one-time** login code» και «temporary login code», ενώ ο κωδικός είναι στατικός.
  - Ο χρήστης που δεν υπάρχει απορρίπτεται **πριν** από το hash, οπότε υπάρχει διαφορά
    χρόνου που επιτρέπει να μαντέψει κανείς ποια emails υπάρχουν.
- **Παράδειγμα:** Όποιος γνωρίζει τον κοινό demo code μπορεί να ζητήσει login με το email άλλου υπάρχοντος χρήστη στον tenant· ο verifier δεν δεσμεύει τον κωδικό στο `userId`.
- **Πού:** `ddd/users-api/src/auths/infrastructure/env-login-code.verifier.ts`,
  `ddd/users-api/src/auths/services/user-login.service.ts`.
- **Πρόταση:** Να διαχωριστεί ρητά η demo εγκατάσταση από πραγματικό authentication.
  Παραγωγική εφαρμογή με πραγματικούς χρήστες χρειάζεται verifier που δεσμεύει τον κωδικό
  στον χρήστη (π.χ. OTP/IdP) και σαφή επιλογή adapter. Αυτό δεν απαιτεί αφαίρεση του
  χρήσιμου simulated integration· χρειάζεται αποφυγή παραπλανητικής υπόσχεσης production/OTP.

### U-02 · String overload του credential port με χρήση μόνο στα τοπικά specs

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `LoginCredentialVerification | string` υπάρχει τόσο στον
  `ILoginCodeVerifier` όσο και στον `EnvLoginCodeVerifier`. Η πραγματική login ροή περνά
  `{ userId, code }`, ενώ οι κλήσεις με σκέτο string είναι στα adapter specs. Δεν βρέθηκε
  ανεξάρτητο documented consumer contract για αυτή τη μορφή στην εφαρμογή αναφοράς.
  Το branch επιτρέπει παράκαμψη του user context που ο ίδιος ο port οφείλει να μεταφέρει.
- **Παράδειγμα:** `verifier.verify('424242')` στα specs έναντι
  `verify({ userId: user.id, code })` στο `UserLoginService.authenticate`.
- **Πού:** `ddd/users-api/src/auths/application/authentication.ports.ts`,
  `ddd/users-api/src/auths/infrastructure/env-login-code.verifier.ts`,
  `ddd/users-api/src/auths/infrastructure/authentication-adapters.spec.ts`,
  `ddd/users-api/src/auths/services/user-login.service.ts`.
- **Πρόταση:** Τα specs να χρησιμοποιούν το πραγματικό credential object και να
  αξιολογηθεί αφαίρεση του string overload **και από το port**. Η χρήση είναι
  επαληθευμένη· η ιστορική πρόθεση του δημιουργού δεν συνάγεται από το reference search.

### U-03 · Το `auths/services/` ανακατεύει layers: HTTP exceptions, `process.env`, `jose`

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Στον ίδιο φάκελο βρίσκονται μια καθαρή application service
  (`UserLoginService`, μόνο με ports) και authenticators που είναι στην ουσία adapters
  παρουσίασης ή υποδομής:
  - Τα `JwtAuthenticator`, `ApiClientAuthenticator` και `RequestPrincipalResolver` ρίχνουν Nest
    `UnauthorizedException`.
  - Τα `JwtAuthenticator` και `ApiClientAuthenticator` διαβάζουν `process.env`. Το πρώτο διαβάζει
    `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ALGORITHMS` και τα κλειδιά **σε κάθε αίτημα**, με cache
    που ελέγχει αν άλλαξαν τα raw strings του env.
  - Το `JwtAuthenticator` εισάγει απευθείας το `jose`.

  Το codebase map ισχυρίζεται ότι «`jose` stays behind `ddd/users-api/src/auths/infrastructure/jose-access-token.issuer.ts`» και ότι
  «token settings are parsed at boot (`ddd/users-api/src/common/environment/auth-token.config.ts`)». Αυτό ισχύει μόνο για την έκδοση
  του token, όχι για την επαλήθευσή του. Υπάρχουν δύο μηχανισμοί ρυθμίσεων για το ίδιο JWT.
  Επιπλέον το `ApiClientAuthenticator` αντιμετωπίζει ασυνεπώς τα λάθη ρύθμισης: άκυρο JSON
  στο `API_CLIENTS` → `warn` και απενεργοποίηση, αλλά άκυρο `rules` → `throw` κατά την
  κατασκευή.
- **Παράδειγμα:** Ο issuer παίρνει boot-time token policy, ενώ ο JWT authenticator ξαναδιαβάζει `JWT_ISSUER`/κλειδιά από env στην verification διαδρομή.
- **Πού:** `ddd/users-api/src/auths/services/jwt-authenticator.ts`,
  `ddd/users-api/src/auths/services/api-client-authenticator.ts`,
  `ddd/users-api/src/auths/services/request-principal-resolver.ts`,
  `.claude/codebase-map.md` (Critical Modules → Authentication).
- **Πρόταση:** Οι authenticators να μεταφερθούν στο `auths/infrastructure/`, οι ρυθμίσεις JWT να
  γίνονται parse στο boot μέσα στο `ddd/users-api/src/common/environment/auth-token.config.ts`, και να διορθωθεί ο χάρτης.

### U-04 · Δύο χειροκίνητες λίστες με τα ίδια domain exceptions

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `DomainExceptionFilter.resolveHttpError` και το `EXPECTED_REJECTIONS` του
  dead-letter (DL-05) απαριθμούν χωριστά τις ίδιες κλάσεις. Κάθε νέο exception πρέπει να
  προστεθεί και στα δύο σημεία, αλλιώς το filter το στέλνει στο προεπιλεγμένο 400 και το
  dead-letter το καταγράφει. Ο κλάδος `EmptyUserUpdateException` είναι ταυτόσημος με την
  προεπιλογή, αλλά μπορεί να δηλώνει ρητή πολιτική. Επίσης το `MissingTenantContextError` (βλ. D-07) πέφτει στο προεπιλεγμένο
  **400**, και το μήνυμά του («configure a tenantIdFactory on PipelineModule») εκθέτει
  εσωτερικές λεπτομέρειες διαμόρφωσης στον πελάτη.
- **Παράδειγμα:** `MissingTenantContextError` δεν έχει ειδική HTTP χαρτογράφηση και πέφτει στο default 400, ενώ αφορά αποτυχία εγκατάστασης execution context.
- **Πού:** `ddd/users-api/src/common/filters/domain-exception.filter.ts`,
  `ddd/users-api/src/infrastructure/dead-letter.options.ts`.
- **Πρόταση:** Να διορθωθεί η χαρτογράφηση του `MissingTenantContextError` στο
  presentation boundary και να μειωθεί η επανάληψη όπου υπάρχει κοινή σημασιολογία.
  HTTP status δεν ανήκει στα domain errors. Η πολιτική DLQ και η HTTP χαρτογράφηση
  είναι διαφορετικές αποφάσεις, όχι κατ’ ανάγκη μία κοινή λίστα.

### U-05 · Το σχήμα των cache keys κάθε aggregate επαναλαμβάνεται σε κάθε repository

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Κάθε λειτουργία έχει δικό της repository (create/update/delete/get ανά
  aggregate). Κάθε repository ορίζει **ξανά** τα κλειδιά του aggregate
  (`filterCacheKey(User.aggregateName, { id })` και `{ email }`), σε 4 αρχεία για το User και
  4 για το Role. Η συνέπεια ανάμεσα σε `setKey`, `invalidateKeys`, `deleteKeys` και `keyFn`, που
  είναι η βάση της ορθότητας του cache, εξαρτάται από την προσοχή όποιου αλλάζει τον κώδικα.
  Η παράλειψη ενός δευτερεύοντος κλειδιού σε ένα αρχείο αφήνει stale reads.
- **Παράδειγμα:** Το User by-email key πρέπει να είναι ίδιο στο query `keyFn` και στα write-side `invalidateKeys`/`deleteKeys`· μια αποκλίνουσα αλλαγή αφήνει παλιό entry.
- **Πού:** `ddd/users-api/src/users/persistence/update-user.command-repository.ts`,
  `ddd/users-api/src/users/persistence/get-user.query-repository.ts`, αντίστοιχα στο `roles/persistence/`.
- **Πρόταση:** Ένα `UserCacheKeys` ανά aggregate (`byId`, `byEmail`, `all(user)`), που θα
  χρησιμοποιούν όλα τα repositories.

### U-06 · Explicit request scope, ανακατασκευή query και logging του demo worker

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:**
  - Τα `UpdateUserHandler` και `UpdateRoleHandler` είναι `Scope.REQUEST`, χωρίς καμία εξάρτηση
    που το απαιτεί και χωρίς τεκμηρίωση. Οι άλλοι command/query declarations συνήθως δεν ζητούν explicit request scope·
    το πραγματικό scope μπορεί να προκύπτει και από DI dependencies. Κάθε update
    δημιουργεί νέο instance του handler και περνά από το scoped μονοπάτι του pipeline (P-07).
  - Το `GetUserHandler` ξαναφτιάχνει το query απαριθμώντας με το χέρι τα πεδία
    (`userId`, `email`, `department`). Ένα νέο πεδίο στο σχήμα θα χαθεί σιωπηλά. Περνά
    επίσης το `query.sessionUser`, που δεν ορίζεται στη συγκεκριμένη HTTP διαδρομή, αφού ο controller
    κατασκευάζει το query χωρίς αυτό. Η διατήρηση του πεδίου είναι όμως σωστή
    για μη HTTP callers και δεν πρέπει να αφαιρεθεί λόγω αυτής της τοπικής χρήσης.
  - Ο processor του welcome email γράφει σε log με επίπεδο `log` το **email** του χρήστη (PII).
- **Παράδειγμα:** Προσθήκη πεδίου στο `GetUserQuery` χρειάζεται έλεγχο και στο χειροκίνητο reconstruction του conditional-freshness branch, αλλιώς δεν θα μεταφερθεί.
- **Πού:** `ddd/users-api/src/users/cqrs/commands/update-user.handler.ts`,
  `ddd/users-api/src/roles/cqrs/commands/update-role.handler.ts`,
  `ddd/users-api/src/users/cqrs/queries/get-user.handler.ts`,
  `ddd/users-api/src/users/jobs/send-welcome-email.processor.ts`.

### U-07 · Κάλυψη και ευθραυστότητα των documentation tests

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Το `ddd/users-api/test/docs-cache-security.spec.ts` διαβάζει με `readFileSync` τρία README
  (και από **άλλα** πακέτα) και ελέγχει το κείμενό τους με regex. Είναι εύθραυστο, δεσμεύει
  τη διατύπωση, και δεν έπιασε το επικίνδυνο παράδειγμα του I-03, που βρίσκεται σε JSDoc. Το
  JSDoc μπορεί να περιγράφει τον σημερινό κανόνα χωρίς ιστορική αφήγηση. Ωστόσο ένα
  documentation contract test μπορεί να είναι χρήσιμο. Η λέξη `regressions` σε όνομα
  αρχείου και η ύπαρξη τοπικού README δεν αποτελούν από μόνες τους παραβιάσεις.
- **Παράδειγμα:** Αλλαγή της διατύπωσης σε README μπορεί να σπάσει regex assertion χωρίς αλλαγή του security contract· αντίστροφα, JSDoc εκτός των διαβασμένων αρχείων δεν ελέγχεται.
- **Πού:** `ddd/users-api/test/docs-cache-security.spec.ts`,
  `ddd/users-api/test/pipeline-bootstrap-regressions.spec.ts`.

### U-08 · Εσωτερικές σταθερές και factories εξάγονται για άμεση πρόσβαση των specs

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Τα `createUserIdempotencyKey`, `createUserReplayScope`,
  `createUserRateLimitKey`, `createRoleIdempotencyKey` και `HTTP_LOG_REDACT_PATHS`
  χρησιμοποιούνται στην παραγωγή μέσα στο αρχείο που τα ορίζει, αλλά οι εξωτερικοί
  imports τους είναι μόνο specs. Εδώ το ερώτημα αφορά το **export**, όχι την ύπαρξη
  της λογικής. Δεν είναι package-barrel exports ή τεκμηριωμένα reusable primitives.
- **Παράδειγμα:** Το `ddd/users-api/src/infrastructure/observability.module.spec.ts` εισάγει απευθείας την ίδια λίστα
  redaction και την περνά και στη δοκιμαστική ρύθμιση logger. Έτσι ελέγχει τη λίστα/
  δική του σύνθεση, όχι ότι το πραγματικό module εγκαθιστά σωστά τη ρύθμιση.
- **Πού:** `ddd/users-api/src/infrastructure/observability.module.ts`,
  `ddd/users-api/src/infrastructure/observability.module.spec.ts`,
  `ddd/users-api/src/users/cqrs/commands/create-user.handler.ts`,
  `ddd/users-api/src/roles/cqrs/commands/create-role.handler.ts`,
  `ddd/users-api/test/create-command-replay-scope.spec.ts`.
- **Πρόταση:** Διατήρηση των εσωτερικών helpers και tests μέσω πραγματικού module,
  pipeline ή καταχωρισμένων behavior options. Να αφαιρεθούν μόνο τα exports που δεν
  ανήκουν σε consumer contract. Το `createRoleReplayScope` και το `OPERATION_KEY_VERSION`
  επίσης εξάγονται χωρίς εξωτερικό caller, αλλά αυτό μόνο του δείχνει περιττή ορατότητα,
  όχι ειδική χρήση από tests.

### U-09 · Το persistence ρίχνει Nest `BadRequestException`, εκτός εμβέλειας του Grit ελέγχου

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα (παραβίαση κανόνα) · **Σοβαρότητα:** Μεσαία
- **Προέλευση:** review2, επαληθεύτηκε στον κώδικα.
- **Περιγραφή:** Η skill αρχιτεκτονικής λέει «Do not throw HTTP exceptions from repositories».
  Όμως:
  - `MikroOrmStore.resolveOrm()` → `BadRequestException('Unknown tenant schema: …')`. Καλείται
    από το `em` getter που χρησιμοποιούν όλα τα repositories. Όποιος κώδικας χρησιμοποιήσει
    το store εκτός HTTP (π.χ. worker μέσα σε `tenantContext.run(job.data.tenant, …)`) θα
    λάβει HTTP 400 exception για άγνωστο tenant. Οι σημερινοί BullMQ processors είναι
    simulated και δεν αγγίζουν το store, οπότε αυτό είναι δυνητική και όχι τωρινή διαδρομή.
  - `normalizeSchemaName()` → `BadRequestException('Invalid schema name: …')`. Καλείται και κατά
    τη ρύθμιση με το `DB_DEFAULT_SCHEMA`, οπότε ένα λάθος διαμόρφωσης εμφανίζεται ως 400.

  Το `transport-neutral-errors.grit` καλύπτει μόνο `cqrs/`, `domain/`, `application/` και
  `ddd/core`, όχι το `ddd/users-api/src/persistence/`. Γι' αυτό το `pnpm lint:persistence`
  δεν το εντοπίζει.
- **Πού:** `ddd/users-api/src/persistence/mikro-orm.store.ts` (`resolveOrm`),
  `ddd/users-api/src/persistence/tenant-options.ts` (`normalizeSchemaName`), `biome.json`
  (includes του `transport-neutral-errors.grit`).
- **Πρόταση:** Framework-neutral σφάλμα (π.χ. `MissingTenantContextError` ή νέο
  `UnknownTenantError`) με χαρτογράφηση στο presentation boundary, και επέκταση του Grit
  include στους φακέλους persistence των εφαρμογών.

### U-10 · Οι demo προεπιλογές είναι η μόνη σύνθεση, χωρίς production profile

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Προέλευση:** review2 (σύνθεση), επαληθεύτηκε στον κώδικα.
- **Περιγραφή:** Το `ReliabilityModule` αλλάζει backend με βάση το περιβάλλον **μόνο** για το
  cache (memory ↔ Redis). Όλα τα υπόλοιπα demo backends μένουν στην ίδια σύνθεση και σε
  production:
  - `IdempotencyModule.forRoot()` → memory store (I-02)·
  - `RateLimiterMemory` (RL-02)·
  - `InMemoryProvider` με hard-coded flags: αλλαγή flag σημαίνει νέο deploy·
  - `LogAuditSink` με `failOpen: true` (AU-06)·
  - κοινός demo κωδικός σύνδεσης (U-01).

  Τα σχόλια του module λένε «replace for production», αλλά δεν υπάρχει μηχανισμός (profile,
  env switch) που να το κάνει. Δεν είναι παραβίαση του κανόνα 20, γιατί ο κώδικας είναι
  πραγματικό runtime path.
- **Πού:** `ddd/users-api/src/infrastructure/reliability.module.ts`,
  `ddd/users-api/src/infrastructure/observability.module.ts`,
  `ddd/users-api/src/auths/infrastructure/env-login-code.verifier.ts`.
- **Πρόταση:** Ρητός διαχωρισμός demo/local και production σύνθεσης, ή fail-fast στο boot
  όταν `NODE_ENV=production` και χρησιμοποιούνται in-memory backends.

### Σύνοψη `ddd/users-api` (επιπλέον των ενοτήτων 1-13)

| ID | Θέμα | Κατηγορία | Σοβαρότητα |
| --- | --- | --- | --- |
| U-01 | Ο demo credential adapter παραμένει κοινός κωδικός και σε production mode | Συμπέρασμα διαδρομής κώδικα | Υψηλή |
| U-02 | String overload του credential port με χρήση μόνο στα τοπικά specs | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| U-03 | Το `auths/services/` ανακατεύει layers: HTTP exceptions, `process.env`, `jose` | Αρχιτεκτονική πρόταση | Μεσαία |
| U-04 | Δύο χειροκίνητες λίστες με τα ίδια domain exceptions | Αρχιτεκτονική πρόταση | Χαμηλή |
| U-05 | Το σχήμα των cache keys κάθε aggregate επαναλαμβάνεται σε κάθε repository | Αρχιτεκτονική πρόταση | Χαμηλή |
| U-06 | Explicit request scope, ανακατασκευή query και logging του demo worker | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| U-07 | Κάλυψη και ευθραυστότητα των documentation tests | Αρχιτεκτονική πρόταση | Χαμηλή |
| U-08 | Εσωτερικές σταθερές και factories εξάγονται για άμεση πρόσβαση των specs | Συμπέρασμα διαδρομής κώδικα | Χαμηλή |
| U-09 | Το persistence ρίχνει `BadRequestException`, εκτός εμβέλειας του Grit ελέγχου | Συμπέρασμα διαδρομής κώδικα | Μεσαία |
| U-10 | Οι demo προεπιλογές είναι η μόνη σύνθεση, χωρίς production profile | Αρχιτεκτονική πρόταση | Χαμηλή |

---

## 15. Εγκάρσια ευρήματα (όλο το αποθετήριο)

Τα παρακάτω εμφανίζονται σε πολλά πακέτα. Εδώ συγκεντρώνονται σε ένα σημείο, γιατί αυτά
ακριβώς ζήτησε να ελεγχθούν η αναθεώρηση: ο ίδιος κώδικας ή κανόνας σε πολλά σημεία, κώδικας
παραγωγής για τα tests, και «AI slop».

### X-01 · Επανάληψη κανόνων και πραγματικές αποκλίσεις στην τεκμηρίωση

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** AGENTS, skill, codebase map και nested CLAUDE επαναλαμβάνουν κανόνες
  lifecycle, tenant scoping, cache coordination και tests. Η επανάληψη ενός σύντομου
  invariant κοντά στον consumer είναι χρήσιμη· το κόστος εμφανίζεται όταν αντιγράφονται
  ολόκληρες οδηγίες που αποκλίνουν. Δεν χρησιμοποιούνται ανεπαλήθευτες συνολικές
  μετρήσεις γραμμών ως απόδειξη κακής αρχιτεκτονικής.
- **Παράδειγμα:** Ο χάρτης περιορίζει το `jose` στον issuer και μιλά για parsing JWT
  settings στο boot, ενώ ο `JwtAuthenticator` διαβάζει env/κλειδιά κατά την επαλήθευση
  (U-03). Το generic σχόλιο του `Cache.evictKey` λέει ότι το `FromCache` διαβάζει το
  unversioned barrier path, ενώ το reader παρακάμπτει unversioned adapters (D-02).
- **Πού:** `AGENTS.md` (κανόνες 11–19),
  `.agents/skills/nestjs-pipeline-architecture/SKILL.md` (Query/Repository rules),
  `.claude/codebase-map.md` (Authentication), `ddd/core/CLAUDE.md`,
  `ddd/core/persistence/decorators/Cache.ts`,
  `ddd/core/persistence/decorators/FromCache.ts`.
- **Πρόταση:** Κάθε πλήρης κανόνας να έχει σαφή ιδιοκτήτη και οι υπόλοιπες οδηγίες
  να παραπέμπουν εκεί, κρατώντας τοπικά μόνο την απαραίτητη περίληψη/παράδειγμα.
  Η συνοπτική τεκμηρίωση του πραγματικού consumer contract παραμένει στα READMEs.

### X-02 · Πραγματική διπλοτυπία έναντι όμοιου κώδικα με διαφορετικό συμβόλαιο

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Μεσαία
- **Περιγραφή:** Η ενοποίηση χρειάζεται κοινή σημασία και κόστος συντήρησης, όχι απλώς
  ίδιο σχήμα κώδικα. Ιδιαίτερα ο domain δεν πρέπει να εξαρτηθεί από Nest/core για να
  επαναχρησιμοποιήσει έναν μικρό helper.
- **Παράδειγμα:** Το audit serializer διατηρεί `BigInt` με `$type`, ενώ ένα cache
  snapshot πρέπει να είναι JSON. Η αντικατάσταση του πρώτου με JSON clone χάνει το contract.
- **Πού:** Τα συγκεκριμένα σημεία και οι περιορισμοί συνοψίζονται παρακάτω.

  | Τι | Επαληθευμένη εικόνα | Αναφορές |
  | --- | --- | --- |
  | `uuidv7` | 2 αυτολεξεί ίδιες υλοποιήσεις (core, ddd-core domain) και correlation re-export | D-06, C-04 |
  | `untyped()` | 2 ίδιες υλοποιήσεις με `unknown`, όχι `any` | C-04 |
  | Clone / JSON / redaction / freeze | Διαφορετικά contracts, όχι 7 εναλλάξιμα αντίγραφα | Z-02, AU-04, D-06 |
  | Module wiring | Κοινά patterns, διαφορετικά options/lifecycle και async υποστήριξη | RL-04, CA-02, FF-01 |
  | `resolveEffectiveOptions` | 5 instance methods χωρίς κοινή δηλωμένη υπογραφή | P-02 |
  | HTTP response writing | Παρόμοιο `json`/`send`, διαφορετικά status/headers | Z-05, RL-04 |
  | Postgres identifier guard | Ίδιο regex και αντίστοιχη validation λογική σε 2 adapters | DL-01 |
  | Re-exports | Μία υλοποίηση με πολλά public paths, όχι διπλή λογική | P-03, CA-04 |
  | Fail-open guards | Παρόμοια helpers αλλά και μη προστατευμένοι loggers | O-03, AU-08 |
  | Update validation | Shared DTO shape, επανάληψη refine και domain constraints | Z-06 |
  | Error classification | HTTP και DLQ έχουν διαφορετικούς σκοπούς | U-04 |
  | Aggregate cache keys | Επανάληψη key policy σε create/update/delete/read | U-05 |

- **Πρόταση:** Πρώτα ενοποίηση πραγματικών κοινών πολιτικών, όπως οι factory validators
  και τα aggregate cache keys. Μεγάλες νέες abstractions μόνο με σαφές consumer όφελος.

### X-03 · Test-only επιφάνεια: τεκμήρια και όρια του συμπεράσματος

- **Κατηγορία:** Συμπέρασμα διαδρομής κώδικα · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Διακρίνεται η χρήσιμη παραγωγική λογική από την ορατότητα/overload
  που επιτρέπει σε specs να την προσπελάσουν. Reference search αποδεικνύει τους
  σημερινούς τοπικούς callers, όχι την πρόθεση του δημιουργού ή όλους τους consumers.
- **Παράδειγμα:** Το `HTTP_LOG_REDACT_PATHS` χρειάζεται στο module, αλλά το `export`
  χρησιμοποιείται μόνο από spec. Το `CaslAuthorizer(ability)` αντιθέτως είναι ρητό
  contract στο README ενός δημοσιευμένου πακέτου.
- **Πού:** U-02 και U-08 για τις συγκεκριμένες application επιφάνειες· A-02/Z-01/D-05
  για τα δημόσια contracts που δεν πρέπει να συγχέονται με αυτές.

| ID | Σημείο | Συμπέρασμα |
| --- | --- | --- |
| U-02 | `verify(string)` στον adapter **και στο port** | Μόνο specs χρησιμοποιούν τη string μορφή· έλεγχος στένωσης στο πραγματικό credential object |
| U-08 | Exports key factories και HTTP redaction constant | Εξωτερικά imports μόνο από specs, χωρίς διακριτό application API contract |
| A-02 | `CaslAuthorizer(ability?)` | Τεκμηριωμένο public API, δεν στοιχειοθετείται test-only παράβαση |
| Z-01 | Readable Zod symbols | Τεκμηριωμένο metadata API, δεν παρακάμπτει το trusted validation |
| C-03 | Fallback setter | Δεν έχει τοπικό caller· δεν είναι state που διαβάζουν μόνο tests |
| P-01 | `SET_TENANT_ID` | Ο runner το εισάγει από εσωτερικό module· τη δημόσια εξαγωγή χρησιμοποιούν μόνο δύο users-api specs. Contract risk, με ένδειξη test-only export |
| D-05 | `clonePayload`, `RootEntity.from`, aggregate hooks | Reusable primitives με τεκμηριωμένο contract |

### X-04 · Σχόλια ιστορικού, υπερβολική αφήγηση και JSDoc σε λάθος σημείο

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Η καταγραφή «AI slop» αφορά συγκεκριμένα παραβιασμένα κριτήρια
  συντήρησης, όχι εικασία για το ποιος έγραψε τον κώδικα. Μεγάλο σχόλιο δεν είναι
  αυτομάτως άχρηστο: concurrency/security invariants και δημόσια συμβόλαια χρειάζονται
  τεκμηρίωση. Ιστορική αφήγηση και JSDoc που συνδέεται με λάθος declaration είναι
  συγκεκριμένα προβλήματα.
- **Παράδειγμα:** `What was not correct was baking the first request's name...`
  αφηγείται παλιό σφάλμα. Αρκεί το σημερινό invariant ότι shared policies διαβάζουν
  request-local labels. Αντίθετα, η εξήγηση revision fencing δεν αφαιρείται ως «slop».
- **Πού:**
  - `packages/pipeline-resilience/src/helpers/resilience-context.ts`,
    `packages/pipeline-resilience/src/helpers/policy-factory.ts` (ιστορικό).
  - `packages/pipeline-opentelemetry/src/trace.behavior.ts`,
    `packages/pipeline-cache/src/adapters/cache-manager.adapter.ts` (ιστορικό).
  - `packages/pipeline-opentelemetry/src/metrics.behavior.ts`,
    `packages/pipeline-resilience/src/resilience.behavior.ts`,
    `ddd/users-api/src/infrastructure/observability.module.ts` (JSDoc σε άλλο declaration).
  - `ddd/users-api/src/auths/services/user-login.service.ts` (tutorial μέσα σε service),
    `ddd/core/domain/exceptions/concurrency-conflict.error.ts` (ιστορικό).
- **Πρόταση:** Σύντομα σχόλια για ενεργά invariants, consumer παραδείγματα σε README/API
  docs και JSDoc δίπλα στο σωστό symbol. Η λέξη `regressions`, ένα compatibility notice
  ή τοπικό README δεν αποτελούν από μόνα τους παραβίαση. License/deprecation notices
  και αναγκαίοι interoperability περιορισμοί διατηρούνται.

### X-05 · Διαφορές στα APIs και στις πολιτικές των behaviors

- **Κατηγορία:** Αρχιτεκτονική πρόταση · **Σοβαρότητα:** Χαμηλή
- **Περιγραφή:** Τα `scope`, `kinds`, `captureKinds` ονομάζουν συγγενείς επιλογές,
  ενώ merge και fail-open πολιτικές διαφέρουν. Οι διαφορές χρειάζονται σαφή οδηγό,
  αλλά δεν είναι όλες λανθασμένες: audit capture, runtime safety και επιλογή request
  kind υπηρετούν διαφορετικές φάσεις.
- **Παράδειγμα:** Ο deadletter ενώνει `ignoreErrors`, ενώ ο audit κάνει shallow
  override handler defaults. Ο resilience απορρίπτει unsafe retry και στο runtime,
  ακόμη και αν το bootstrap diagnostic έχει απενεργοποιηθεί.
- **Πού:** `packages/pipeline-deadletter/src/dead-letter.behavior.ts`,
  `packages/pipeline-audit/src/audit.behavior.ts`,
  `packages/pipeline-resilience/src/resilience.behavior.ts`,
  `packages/pipeline-feature-flags/src/feature-flags.module.ts`.
- **Πρόταση:** Ενιαίος πίνακας ονομάτων/merge/ownership χωρίς αναγκαστική αλλαγή όλων
  των APIs. Typed item wrappers παραμένουν additive. Cache και memory idempotency
  κατασκευάζονται στο `forRoot`, ενώ ο OpenFeature provider καταχωρίζεται από Nest
  **provider factory**, όχι κατά το import.

## 16. Συνολική σύνοψη και προτεραιότητες

### Επαληθεύσεις που εκτελέστηκαν

Οι εκτελέσεις έγιναν στις 2026-09-22, στο ίδιο commit κώδικα που επανελέγχθηκε στις
2026-09-23. Οι αλλαγές του review δεν τροποποιούν παραγωγικό κώδικα ή δημόσια APIs.

| Εντολή / έλεγχος | Αποτέλεσμα |
| --- | --- |
| `pnpm test` | 14 workspaces επιτυχή: 1.200 tests στα 12 packages, 359 στο ddd/core, 737 στο users-api — 2.296 συνολικά |
| `pnpm lint` | Επιτυχής έλεγχος τύπων σε όλα τα workspaces |
| `pnpm lint:persistence` (μέσω test/lint) | 721 αρχεία, χωρίς διαγνωστικά |
| Στοχευμένο προσωρινό Vitest spec | 10 σενάρια επιβεβαιώθηκαν· αφαιρέθηκε από το repository μετά την εκτέλεση |
| Επιβεβαιωμένες συμπεριφορές από probes | P-04, P-11, C-02, A-01, A-04, AU-08, CA-01, I-02, D-01, D-09, D-10· ένα probe κάλυψε δύο sanitizer περιπτώσεις |
| Διασταύρωση με review2 (2026-09-23) | Προσωρινά specs/probes, όλα αφαιρέθηκαν: P-12 (multi-app prototype fallback), O-08 (tracer error μετά από επιτυχία), Z-07 (`$ZodAsyncError` στον constructor). Έλεγχος κώδικα για A-06, DL-06, I-07, R-06, U-09, U-10 και τα συμπληρώματα P-02, P-07, C-04, O-04, AU-06, DL-04, FF-02, R-02, D-03, D-05 |
| `pnpm context:validate` | Αποτυχία ελέγχου ενημερότητας του υπάρχοντος `.claude/codebase-map.md`· οι υπόλοιποι έλεγχοι πέρασαν. Ο χάρτης δεν ανανεώθηκε στο πλαίσιο αυτού του review |
| `pnpm test:e2e` / `pnpm test:release` | Δεν εκτελέστηκαν· δεν έγινε αλλαγή παραγωγικού ή δημοσιευμένου API |

Η πρώτη sandbox εκτέλεση απέτυχε σε περιορισμούς subprocess (`spawnSync ... EPERM`).
Η επανάληψη εκτός sandbox ολοκληρώθηκε επιτυχώς. Τα πρόσθετα probes επιβεβαιώνουν
τα συγκεκριμένα αποτελέσματα του review· δεν είναι tests που αποδεικνύουν επιδιόρθωση.
Τα O-06, I-01 και R-02 παραμένουν συμπεράσματα/κίνδυνοι διαδρομής, όχι end-to-end
αναπαραγωγές. Δεν επαληθεύτηκε πραγματική παράδοση telemetry σε collector.

### Προτεραιότητα 1 — Υψηλή σοβαρότητα

| ID | Θέμα και όριο συμπεράσματος |
| --- | --- |
| D-01 | Επιβεβαιωμένο ABA από eviction του MemoryCache |
| D-09 | Επιβεβαιωμένο ABA από clear με ενεργό reader |
| D-10 | Επιβεβαιωμένο unfenced write-through μετά από αποτυχία αρχικής readState |
| I-01 | Business-object deduplication μπορεί να απαντήσει replay μετά από delete· χρειάζεται ρητή απόφαση operation identity |
| O-06 | Signal listeners χωρίς κλείσιμο της εφαρμογής· χρειάζεται ενοποιημένο graceful shutdown |
| U-01 | Κοινός demo code δεν είναι παραγωγικό authentication ανά χρήστη· ο κίνδυνος αφορά deployment του demo ως πραγματικής εφαρμογής |

### Προτεραιότητα 2 — Μεσαία σοβαρότητα (ασφάλεια και ορθότητα)

P-04/P-11 (matching και exclusions του sanitizer), A-01 (operator interpolation),
AU-08 (logger που ακυρώνει fail-open), CA-01/D-04 (τύπος hit/miss), CA-02/FF-01
(ownership συνδέσεων/providers), I-03 (unsafe key example), R-02 (composition timeout
και idempotency), RL-01/RL-02 (διαστάσεις και deployment limiter), C-05 (HTTP correlation
hardening), D-03 (cache wiring), P-01 (public tenant setter), CA-03 (permission-dependent
scope), I-02 (χωρητικότητα/shared deployment), AU-06 (επιλογή audit coverage και fail-open
σε HIGH ενέργειες), P-12 (multi-app prototype fallback χωρίς pipeline), O-08 (tracer error
αντικαθιστά επιτυχημένο αποτέλεσμα), U-09 (HTTP exception στο persistence).
Η διαφορετική σημασία A-03 είναι τεκμηριωμένη: χρειάζεται σωστή χρήση πριν εξεταστεί
αλλαγή contract. Το U-03 αφορά οργάνωση adapters/configuration και ακρίβεια του χάρτη.

### Προτεραιότητα 3 — Αρχιτεκτονική απλοποίηση

P-02 (typed instance contract), AU-01 (κοινή factory validation), Z-06 (επανάληψη
application schemas), U-05 (ενιαία aggregate cache-key policy), O-04 (additive typed
item wrappers), X-01/X-02 (ιδιοκτησία κανόνων και ενοποίηση μόνο σημασιολογικά ίδιων helpers).
Δεν δικαιολογείται γενική αφαίρεση repository caching, barrier compatibility,
Zod provenance ή reusable aggregate APIs από την απουσία τοπικών callers.

### Προτεραιότητα 4 — Καθαριότητα

U-02/U-08 (application overload/export surface με callers μόνο specs), X-04 (σχόλια
ιστορικού και misplaced JSDoc), P-09 (επικαλυπτόμενα tests). Τα A-02, Z-01 και D-05
δεν τεκμηριώνουν test-only παραγωγικό κώδικα. Τα O-05 και R-01 δεν τεκμηριώνουν αντίστοιχα
υποχρεωτικό no-op metrics ή παραβίαση του bootstrap diagnostics contract.

### Πλήθος ευρημάτων ανά περιοχή

Μετρώνται όλα τα σημεία ελέγχου, συμπεριλαμβανομένων προτάσεων και διευκρινίσεων
υποστηριζόμενων contracts. Τα εγκάρσια σημεία συνοψίζουν προηγούμενα· δεν είναι
ανεξάρτητα νέα ελαττώματα.

| Περιοχή | Υψηλή | Μεσαία | Χαμηλή |
| --- | --- | --- | --- |
| `packages/pipeline` | 0 | 5 | 7 |
| `packages/pipeline-correlation` | 0 | 2 | 5 |
| `packages/pipeline-casl` | 0 | 2 | 4 |
| `packages/pipeline-opentelemetry` | 1 | 2 | 5 |
| `packages/pipeline-zod` | 0 | 1 | 6 |
| `packages/pipeline-audit` | 0 | 3 | 5 |
| `packages/pipeline-cache` | 0 | 3 | 2 |
| `packages/pipeline-deadletter` | 0 | 0 | 6 |
| `packages/pipeline-feature-flags` | 0 | 1 | 3 |
| `packages/pipeline-idempotency` | 1 | 2 | 4 |
| `packages/pipeline-rate-limit` | 0 | 2 | 2 |
| `packages/pipeline-resilience` | 0 | 1 | 5 |
| `ddd/core` | 3 | 2 | 5 |
| `ddd/users-api` | 1 | 2 | 7 |
| Εγκάρσια | 0 | 2 | 3 |

## 17. Σημεία του review2 που δεν ενσωματώθηκαν

Το review2 (commit `59a88a50`) συγκρίθηκε με την **αρχική** έκδοση αυτού του αρχείου
(`f5ef9591`). Γι' αυτό ορισμένα σημεία του καλύπτονται ήδη από τις διορθώσεις της έκδοσης
`0d72e449`. Τα παρακάτω δεν ενσωματώθηκαν ως νέα ευρήματα:

| Σημείο review2 | Αιτιολόγηση |
| --- | --- |
| Private Nest APIs / runtime weaving ως γενικό P1 | Το `ExplorerService` είναι αποδεκτό και τεκμηριωμένο trade-off (κανόνας 9). Προστέθηκε μόνο η μη τεκμηριωμένη αντικατάσταση μεθόδων του `InstanceWrapper` (P-07). |
| `CaslAuthorizer` ambient fallback ως coupling | Τεκμηριωμένο contract (README, JSDoc)· καλύπτεται στο A-02. |
| Projection semantics | Ίδια ρίζα με το A-03. |
| `MetricsBehavior`: instruments Map ανά instance | Δεν είναι ελάττωμα. Το OpenTelemetry API επιστρέφει τον ίδιο meter ανά όνομα, και η επαναδημιουργία instrument δεν αλλάζει την καταγραφή. |
| Τρεις επιφάνειες επικύρωσης Zod / in-place mutation | Καλύπτονται από τα Z-02, Z-03 και Z-06. |
| Cache: αυθαίρετο custom key, fail-open σε σφάλμα store, δύο layers cache | Το custom key καλύπτεται από τα CA-03 και A-06. Το fail-open είναι τεκμηριωμένη πολιτική για cache απόδοσης (X-05). Τα δύο layers είναι ρητή απόφαση (κανόνας 16). |
| Feature flags: `defaultValue: true` ανοίγει critical flag σε σφάλμα provider | Η προεπιλογή είναι `false` (κλείνει ασφαλώς). Το `true` είναι ρητή επιλογή του consumer, και το `errorPolicy: 'throw'` υπάρχει γι' αυτή την περίπτωση. |
| Feature flags: σειρά merge του evaluation context | Τεκμηριώνεται στο JSDoc του `buildEvaluationContext`. |
| Rate limit: ο `keyFactory` δεν αποδεικνύει σωστό partitioning | Ισχύει για κάθε consumer-supplied key. Το πακέτο προσφέρει partitioned factory που αποτυγχάνει ασφαλώς· καλύπτεται από τα RL-01 και A-06. |
| Resilience: το `replaySafe` είναι μόνο δήλωση | Τεκμηριώνεται ρητά ως «explicit acknowledgement»· το R-05 δείχνει τη συνέπεια. |
| Resilience: policy cache ανά `handlerType` | Τα options είναι στατικά metadata του decorator, άρα δεν υπάρχει διαφοροποίηση ανά αίτημα για να χαθεί. Το κοινό state του breaker/bulkhead είναι η σκοπούμενη σχεδίαση. |
| `CommandBaseHandler` εξαρτάται από το Nest `EventBus` | Σκόπιμη απόφαση: το ddd-core περιγράφεται ως «Nest-oriented», ο domain παραμένει framework-neutral, και ο κανόνας 8 επιβάλλει το `CommandBaseHandler`. |
| Public setters του `RootEntity` | Αποδεκτό trade-off για MikroORM `accessor: true` (κανόνας 6), με `@internal`/`@deprecated` και Grit έλεγχο. |
| Δύο συμβόλαια cache (`ICache`/`IVersionedCache`) | Καλύπτεται από το D-02. |
| Μεγάλα infrastructure modules | Εκτίμηση συντηρησιμότητας χωρίς συγκεκριμένο ελάττωμα. Η ουσιαστική πτυχή (demo προεπιλογές) καταγράφεται στο U-10. |

## 18. Uncommitted changes review (2026-09-23)

Reviewed staged and unstaged changes against HEAD on 2026-09-23, including published
pipeline packages, DDD mutation/cache helpers, users-api wiring and the consolidated
migration. Findings below are code-path inferences; no tests or runtime probes were run
for this review, at the owner's request.

### Fixed findings

| Severity | Finding | Repair and coverage |
| --- | --- | --- |
| High | `TraceBehavior` assigned its execution promise only after calling `next()`. A synchronous throw left it unset, so the tracer fallback could call the handler again. | Capture execution in `Promise.resolve().then(next)`. Added a synchronous-throw regression asserting original-error identity and one invocation. |
| High | When a tracer invoked its callback and then threw, the callback promise could reject without an observer. The new fake tracer caught that rejection itself, hiding the production failure. | Retain and return the callback promise on fallback. Removed the fake tracer's rejection suppression; existing failure-isolation cases exercise the actual path. |
| Medium | A cache read failure returned the original result while normal misses returned JSON data; cache availability changed response types such as Date versus string. | Reuse the miss conversion after read failure while suppressing cache writes. Added a Date-result regression. |
| Medium | Cache diagnostic loggers could throw before/after the handler and replace the successful result or configured store error. The new non-serializable-result warning had the same problem. | Guard cache diagnostics, preserving fail-open/fail-closed behavior. Added throwing-logger cases. |
| Low | The feature-flag lifecycle test helper called the client factory twice, including an unawaited second registration. | Exclude the client factory from lifecycle-provider construction. |
| Low | Documentation claimed IP throttling prevented password spraying and victim lockout, and that audit-record construction could not fail a request. | Document per-IP/per-process quotas and record/sink failOpen behavior accurately. |
| Low | Module tutorials, redundant field comments and test titles described more behavior than the code exercised. | Retained useful module purpose/configuration descriptions, removed redundant comments, corrected test names, cleaned up a supplied test store and removed the migration helper's unused target option. |
| Medium | D-03: a repository with `@Cache`/`@FromCache` and no `cache` property silently skipped caching. | `persistence/helpers/cache-owner.helper.ts` logs one warning per class; a declared but unset `cache` stays silent. Added once-only and deliberate-unset cases. |
| Medium | D-04: a `@FromCache` hit could return a raw snapshot typed as the aggregate when `query.hydrate` was false or no hydrator existed. | Every hit is rehydrated when a hydrator applies. Without one, only plain data is cached; class results and `serializeFn` reshapes are returned uncached with one warning. Updated hit/miss specs and added uncached cases. |
| High | U-01: one shared login code signed in any user of any tenant, yet the adapter documented a production path and the service called the code "one-time". | Renamed to `SharedDemoLoginCodeVerifier`, documented as a demo mechanism; production requires `AUTH_SHARED_LOGIN_CODE=true`. Added an unacknowledged-production case. |
| Medium | U-09: persistence threw Nest `BadRequestException` and the transport-neutral Grit rule did not cover persistence. | Framework-neutral tenant schema errors; the middleware keeps the 400 for a malformed header. Grit include extended to `persistence/`. Added a malformed-header case. |

Primary code: `packages/pipeline-opentelemetry/src/trace.behavior.ts`,
`packages/pipeline-cache/src/cache.behavior.ts` and their regression specs.

### Accepted decisions

- Single decorated User/Role mutation methods return the entity. `applyPatch` owns field
  validation/normalization; the decorator owns lifecycle advancement and event recording.
  Auth's conditional orchestration remains because grace refreshes and repeated revocation
  must not advance the mutation lifecycle.
- The showcase intentionally has one complete initial migration. Its schema includes
  materialized permissions, hashed refresh sessions and consumed-token history; the seed
  precedes permission materialization. No compatibility migration is required.
- Published-package behavior changes remain release considerations even though users-api
  compatibility is waived: tenant immutability, stricter correlation IDs, required cache
  permission scope, JSON cache results and aggressive-timeout acknowledgement.
- Provider metadata tests are not proof of Nest integration. The compiled-consumer release
  check remains required; no new claim of DI/runtime verification is made here.

### Verification for the owner

Build current workspace outputs before testing because users-api imports compiled packages:

```bash
pnpm build
pnpm test
pnpm test:e2e
pnpm test:release
```

The e2e suite needs its configured external services, including Docker for Testcontainers.
The earlier user-reported green result preceded this review's fixes. A subsequent
owner-run suite reported one failure in `test/behaviors.spec.ts`: a command retry
fixture used an implicit aggressive timeout. The fixture now selects `cooperative`;
the owner reported the focused rerun green. Full-suite verification after that fix
has not been reported.

`pnpm lint` (workspace typechecks and persistence/domain guards) and `pnpm check`
passed. Test suites remain pending with the owner. The task tracker records the
mutation and migration jobs: `.claude/tasks/architecture-review-fixes.md`.
