# CASL v2: πώς δουλεύει, με ένα παράδειγμα από την αρχή ως το τέλος

Περιγράφει το σύστημα **μετά** την υλοποίηση του `CASL.v2.Implementation.Plan.md`. Είναι γραμμένο σαν να κάνεις debug ένα αίτημα: τι υπάρχει στη βάση, τι γίνεται σε κάθε βήμα, τι βλέπεις στη μνήμη και πού βάζεις breakpoint.

## 1. Τα κομμάτια με μια ματιά

```
HTTP ─► AuthSessionGuard ─► Controller ─► CommandBus/QueryBus
          (επαλήθευση JWT)                     │
                                               ▼
                                      Pipeline behaviors
                                      ├─ CaslBehavior      ◄── CaslPermissionSource (users + user_permission_rules)
                                      ├─ RateLimit / Idempotency / Cache
                                      ▼
                                      Handler
                                      ├─ φόρτωση aggregate
                                      ├─ authorizer.authorize(...)  (έλεγχος οντότητας/πεδίων)
                                      ├─ domain method + save
                                      └─ authorizer.project(...)     (φιλτράρισμα απάντησης)
```

Δύο έλεγχοι, δύο ερωτήσεις:

| Πού | Ερώτηση | Παράδειγμα |
| --- | --- | --- |
| `CaslBehavior` (πριν τον handler) | «Μπορεί γενικά να κάνει `update` σε `User`;» | Ναι, αν έχει οποιονδήποτε κανόνα `update User`, ακόμα και με όρους. |
| Handler (`authorize`/`project`) | «Μπορεί σε **αυτόν** τον χρήστη, σε **αυτά** τα πεδία;» | Ελέγχει τους όρους π.χ. `department` πάνω στα πραγματικά δεδομένα. |

## 2. Τα δεδομένα του παραδείγματος (tenant `acme`)

### `capabilities`: οι κανόνες

| id | subject | action | conditions | fields | inverted |
| --- | --- | --- | --- | --- | --- |
| c1 | User | read | | | false |
| c2 | User | update | `{"department":"${user.department}"}` | username | false |
| c3 | Role | read | | | false |
| c4 | User | read | | email | **true** |
| c5 | User | delete | | | false |
| c6 | UserCapabilities | read | `{"userId":"${user.id}"}` | | false |

Η ίδια πληροφορία σε compact μορφή (για seeds και για το `API_CLIENTS`):

```
User|read|*
User|update|{"department":"${user.department}"}|username
Role|read|*
!User|read|*|email
User|delete|*
UserCapabilities|read|{"userId":"${user.id}"}
```

### Ρόλοι και αναθέσεις (η πηγή αλήθειας)

```
roles:                          role_capabilities:
  r-lead   "team-lead"            r-lead → c1, c2, c3, c4, c5, c6

users:                          user_roles:              user_denied_capabilities:
  u-maria  department=engineering  u-maria → r-lead        u-maria → c5
  u-kostas department=engineering
  u-nikos  department=sales
```

Η Μαρία είναι team-lead, αλλά **δεν** επιτρέπεται να διαγράφει χρήστες. Αυτό είναι προσωπική απαγόρευση, που υπερισχύει του ρόλου.

### `user_permission_rules`: οι έτοιμες γραμμές της Μαρίας

Φτιάχνονται από τον `UserPermissionsProjector` σε κάθε αλλαγή:

| user_id | position | source | role_id | capability_id | subject | action | conditions | fields | inverted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| u-maria | 1 | role | r-lead | c1 | User | read | | | false |
| u-maria | 2 | role | r-lead | c2 | User | update | `{"department":"${user.department}"}` | username | false |
| u-maria | 3 | role | r-lead | c3 | Role | read | | | false |
| u-maria | 4 | role | r-lead | c4 | User | read | | email | true |
| u-maria | 5 | role | r-lead | c5 | User | delete | | | false |
| u-maria | 6 | role | r-lead | c6 | UserCapabilities | read | `{"userId":"${user.id}"}` | | false |
| u-maria | 7 | denied | | c5 | User | delete | | | **true** |

Διαβάζονται πάντα με `ORDER BY inverted, position`: πρώτα όλα τα grants (1, 2, 3, 5, 6), μετά όλες οι απαγορεύσεις (4, 7). Γι' αυτό η γραμμή 7 νικά τη γραμμή 5.

### `auth`: τα sessions

| id | user_id | refresh_token_hash | previous_refresh_token_hash | rotated_at | expires_at | revoked_at | version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| s-91 | u-maria | `3f1a…` (SHA-256) | | | +14 μέρες | | 1 |

Το ίδιο το refresh token **δεν** αποθηκεύεται πουθενά· μόνο το hash του.

## 3. Login

`POST /auths/login` με email και κωδικό:

1. **`CreateAuthHandler`:** ελέγχει τα στοιχεία, δημιουργεί session `s-91`, αποθηκεύει το `sha256(refreshToken)`.
2. **Απάντηση:**

```http
HTTP/1.1 200 OK
Set-Cookie: refresh_token=Qm9…; HttpOnly; Secure; SameSite=Strict; Path=/auths

{ "accessToken": "eyJ…", "accessTokenExpiresAt": 1790000300000 }
```

3. **Το access token** (5 λεπτά) περιέχει μόνο ταυτότητα, **όχι** δικαιώματα:

```json
{ "sub": "u-maria", "sid": "s-91", "tenant": "acme", "principalType": "user", "iat": 1790000000, "exp": 1790000300, "jti": "…" }
```

## 4. Επιτυχημένο αίτημα: η Μαρία αλλάζει όνομα στον Κώστα

`PATCH /users/u-kostas` με `{ "username": "kostas.p" }` και `Authorization: Bearer eyJ…`.

**Βήμα 1: Guard** (`AuthSessionGuard` → `JwtAuthenticator`). Επαληθεύει υπογραφή και `exp`, **χωρίς** query στη βάση. Session user: `{ id: 'u-maria', principalType: 'user', tenant: 'acme' }`.

**Βήμα 2: `CaslBehavior`.** Ο handler δηλώνει `@UsePipeline(requires({ action: 'update', subject: 'User' }))`.
- **`CaslPermissionSource.load()`** κάνει δύο queries **παράλληλα**, δηλαδή ένα round-trip:

  ```sql
  select * from users where id = 'u-maria';
  select * from user_permission_rules where user_id = 'u-maria' order by inverted asc, position asc;
  ```

- **`buildAbility(rules, principal)`** αντικαθιστά τα placeholders με τα στοιχεία του principal. Αυτό υπάρχει στη μνήμη (breakpoint: `getCaslAbility().rules`):

  ```js
  principal = { id: 'u-maria', principalType: 'user', department: 'engineering' }
  rules = [
    { action: 'read',   subject: 'User' },
    { action: 'update', subject: 'User', conditions: { department: 'engineering' }, fields: ['username'] },
    { action: 'read',   subject: 'Role' },
    { action: 'delete', subject: 'User' },
    { action: 'read',   subject: 'UserCapabilities', conditions: { userId: 'u-maria' } },
    { action: 'read',   subject: 'User', fields: ['email'], inverted: true },
    { action: 'delete', subject: 'User', inverted: true },
  ]
  ```

- **Έλεγχος τύπου** `can('update', 'User')` → **true**. Ο κανόνας έχει όρο, αλλά σε επίπεδο τύπου αρκεί να υπάρχει.
- Το ability και ο principal αποθηκεύονται στο `context.items`, ώστε να τα βρει ο handler.

**Βήμα 3: Handler** (`UpdateUserHandler`):

```ts
const user = await this.commandRepository.findById('u-kostas');   // φρέσκο, όχι από cache
this.authorizer.authorize('update', user, ['username']);           // department = engineering ✔, πεδίο username ✔
user.update({ username: 'kostas.p' });
await this.commandRepository.save(user);                           // versioned update
```

**Βήμα 4: Απάντηση μέσω εξουσιοδοτημένου read.** Ο controller κάνει `GetUserQuery(u-kostas)`, με νέο pipeline και νέο `CaslBehavior`. Ο handler καλεί `project('read', user, { id, username, email, department })`, και ο κανόνας 4 κρύβει το `email`:

```json
{ "id": "u-kostas", "name": "kostas.p", "department": "engineering" }
```

## 5. Αίτημα που απορρίπτεται: η Μαρία πάει να αλλάξει τον Νίκο (sales)

`PATCH /users/u-nikos` με `{ "username": "n" }`.

- **Βήματα 1–2:** ίδια με πριν. Ο έλεγχος τύπου περνάει.
- **Βήμα 3:** το `authorize('update', nikos, ['username'])` αποτυγχάνει, γιατί `department: 'sales' ≠ 'engineering'`. Πετάει:

  ```
  UnauthorizedActionException {
    action: 'update', subject: 'User', entityId: 'u-nikos',
    message: 'Access denied: insufficient permissions to update User.'
  }
  ```

- **Αποτέλεσμα:** το `UnauthorizedActionFilter` το μετατρέπει σε **HTTP 403**. Δεν γίνεται save και δεν δημοσιεύεται κανένα event.

Άλλες περιπτώσεις απόρριψης:

| Αίτημα | Πού σταματά | Γιατί |
| --- | --- | --- |
| `PATCH /users/u-kostas` με `{ "department": "sales" }` | `authorize` | Το πεδίο `department` δεν επιτρέπεται. Το μήνυμα έχει `fields: ['department']`. |
| `DELETE /users/u-kostas` | `CaslBehavior` | Η γραμμή 7 (deny) νικά τη 5, άρα το `can('delete','User')` είναι false πριν καν φτάσει στον handler. |
| Οποιοδήποτε αίτημα χωρίς token | `CaslBehavior` | Το `load()` επιστρέφει `null`, άρα «authentication required» και 403. |

## 6. Ανάγνωση με φιλτράρισμα πεδίων: overview

`GET /users/u-maria/overview`:

1. **Χρήστης:** φορτώνεται φρέσκος, και το `authorize('read', maria)` περνάει.
2. **Δικαιώματα:** το `can('read', UserCapabilities{userId:'u-maria'})` περνάει μέσω του κανόνα c6 (μόνο για τον εαυτό της). Διαβάζονται οι αναθέσεις και περνούν από `project` πάνω στο `UserCapabilities`.
3. **Ρόλοι:** για κάθε ρόλο ελέγχεται `can('read', role)` και `can('read', role, 'name')`.
4. **Τελικό φιλτράρισμα:** ένα τελικό `project` πάνω στον `User` κρύβει το `email`.

```json
{ "id": "u-maria", "username": "maria", "department": "engineering",
  "roles": ["team-lead"], "capabilities": [] }
```

Το `GET /users/u-kostas/overview` από τη Μαρία δίνει προφίλ χωρίς `roles`/`capabilities`, γιατί ο κανόνας c6 ισχύει μόνο για το δικό της `userId`.

## 7. Αλλαγή δικαιωμάτων: τι γίνεται στη βάση

| Αλλαγή | Τι κάνει η βάση/ο κώδικας | Πότε ισχύει |
| --- | --- | --- |
| Αφαιρείς την απαγόρευση c5 από τη Μαρία | Ο writer σβήνει τη γραμμή στο `user_denied_capabilities` **και** καλεί `rebuild(['u-maria'])` στην ίδια συναλλαγή. Η γραμμή 7 φεύγει. | Στο επόμενο αίτημα |
| Διαγράφεις τον ρόλο `team-lead` | Το `on delete cascade` σβήνει `user_roles`, `role_capabilities` **και** τις γραμμές 1–6 της Μαρίας στην ίδια εντολή. Μένει μόνο η 7. | Στο επόμενο αίτημα |
| Αλλάζει το τμήμα του Κώστα σε `sales` | Τίποτα στον `user_permission_rules`. Το `${user.department}` της Μαρίας δεν αλλάζει, αλλά ο Κώστας πλέον δεν ταιριάζει στον όρο. | Στο επόμενο αίτημα |
| Αλλάζει το τμήμα της Μαρίας | Τίποτα στον πίνακα. Το placeholder συμπληρώνεται από τη φρέσκια γραμμή `users`. | Στο επόμενο αίτημα |
| Χειροκίνητο SQL / seed | `pnpm --filter @nestjs-pipeline/ddd-users-api permissions:rebuild` | Μετά το rebuild |

Έλεγχος ότι όλα είναι συγχρονισμένα: `permissions:verify`, που τυπώνει όσους χρήστες έχουν απόκλιση και επιστρέφει exit code ≠ 0. Η σύγκριση γίνεται με τη **σειρά** των κανόνων, όχι με τα νούμερα του `position`, γιατί μετά από cascade μένουν κενά (π.χ. 1, 2, 7).

**Αναβάθμιση υπάρχουσας βάσης:** το migration δημιουργεί τον πίνακα **και τον γεμίζει** από τους πίνακες-πηγή. Σειρά: σταματάς την παλιά έκδοση → `db:migrate` → `permissions:verify` (πρέπει να δώσει 0) → ξεκινάς τη νέα. Έτσι κανένας χρήστης δεν βρίσκεται ποτέ χωρίς δικαιώματα.

## 8. Refresh token

Μετά από 5 λεπτά το access token λήγει. Η SPA καλεί `POST /auths/refresh` χωρίς body· ο browser στέλνει μόνος του το cookie.

```
παρουσιάστηκε hash = 3f1a… (τρέχον)  →  rotation
  auth s-91: previous = 3f1a…, current = 7c2e…, rotated_at = τώρα, version 2
  απάντηση: νέο accessToken + Set-Cookie refresh_token=<νέο>
```

| Σενάριο | Αποτέλεσμα |
| --- | --- |
| Δεύτερο tab στέλνει ταυτόχρονα το **αμέσως προηγούμενο** token (μέσα σε 30 s) | 200 με νέο access token, **χωρίς** rotation και **χωρίς** νέο cookie. Δεν χρειάζεται retry· το cookie του πρώτου tab ισχύει για όλα. |
| Κάποιος στέλνει το προηγούμενο token **μετά** τα 30 s | Θεωρείται κλοπή: `revoked_at` = τώρα, 401 `refresh_reused`. Ούτε το νέο token δουλεύει πια. |
| Κάποιος στέλνει **ακόμα παλαιότερο** token (π.χ. A μετά από A → B → C) | Βρίσκεται στον πίνακα `auth_consumed_refresh_tokens`, άρα κλοπή: ανάκληση όλου του session, 401 `refresh_reused`. |
| Logout | `revoked_at` = τώρα, το cookie σβήνεται. Το access token που υπάρχει ήδη ισχύει έως 5 λεπτά. |
| Σβήνεται ο χρήστης | Cascade σβήνει τα sessions. Το επόμενο αίτημα απορρίπτεται, γιατί το `load()` δεν βρίσκει χρήστη. |

## 9. Προαιρετικά: όλη η δουλειά από το access token

Με `PERMISSIONS_IN_ACCESS_TOKEN=true`, στο login και σε κάθε refresh ο server διαβάζει τις γραμμές `user_permission_rules` και τις βάζει μέσα στο access token:

```json
{ "sub": "u-maria", "sid": "s-91", "tenant": "acme", "principalType": "user",
  "department": "engineering",
  "perms": ["User|read|*", "User|update|{\"department\":\"${user.department}\"}|username",
            "Role|read|*", "User|delete|*", "UserCapabilities|read|{\"userId\":\"${user.id}\"}",
            "!User|read|*|email", "!User|delete|*"],
  "exp": 1790000300 }
```

Τι αλλάζει στο αίτημα της ενότητας 4:

- **Βήμα 1:** το `JwtAuthenticator` διαβάζει τα `perms` και τα βάζει στον session user ως `grants`.
- **Βήμα 2:** το `CaslPermissionSource.load()` βλέπει τα `grants` και **δεν κάνει κανένα query**. Οι κανόνες στη μνήμη είναι ακριβώς ίδιοι με πριν.
- **Βήματα 3–4:** ίδια (φόρτωση του aggregate, `authorize`, `project`).

| | Default (βάση) | Από το token |
| --- | --- | --- |
| Queries για authorization ανά αίτημα | 1 round-trip | 0 |
| Αλλαγή δικαιωμάτων, τμήματος ή σβήσιμο χρήστη ισχύει | στο επόμενο αίτημα | στο επόμενο refresh (έως 5 λεπτά) |
| Ποιος βλέπει τους κανόνες | μόνο ο server | και ο client (το JWT είναι υπογεγραμμένο, όχι κρυπτογραφημένο) |

- **Μεγάλο token:** αν το token ξεπεράσει το `ACCESS_TOKEN_MAX_BYTES` (default 2600· το όριο έχει υπολογιστεί ώστε το τελικό κρυπτογραφημένο cookie του Fastify να μένει κάτω από 4 KB), εκδίδεται **χωρίς** `perms` και για αυτόν τον χρήστη ισχύει ο δρόμος της βάσης. Δεν σπάει τίποτα.
- **Απενεργοποίηση:** αν γυρίσεις το option σε `false`, τα `perms` των tokens που ήδη κυκλοφορούν αγνοούνται αμέσως.

## 10. Service client (API key)

Στη ρύθμιση `API_CLIENTS` οι κανόνες γράφονται απευθείας σε compact μορφή, π.χ. `"rules": ["User|read|*|id,username", "Role|read|*"]`. Ελέγχονται κατά την εκκίνηση· ένας λάθος κανόνας σταματά το boot. Για services δεν γίνεται κανένα query δικαιωμάτων.

## 11. Checklist για debug

| Θέλω να δω… | Πού |
| --- | --- |
| Ποιος είναι ο caller | Breakpoint στο `CaslPermissionSource.load` → `session` |
| Αν το αίτημα πήρε τους κανόνες από το token | Breakpoint στο `CaslPermissionSource.load` → υπάρχει `session.grants`; |
| Τους κανόνες όπως είναι στη βάση | `select * from user_permission_rules where user_id = ? order by inverted, position;` |
| Από πού ήρθε ένας κανόνας | Στήλες `source`, `role_id`, `capability_id` της ίδιας γραμμής |
| Τους κανόνες μετά το interpolation | `getCaslAbility().rules` μέσα στον handler |
| Γιατί απορρίφθηκε | Τα `action`, `subject`, `entityId`, `fields` του `UnauthorizedActionException`· `CaslBehavior` (τύπος) ή `authorize` (οντότητα/πεδίο) |
| Γιατί λείπει ένα πεδίο από την απάντηση | `getCaslAbility().relevantRuleFor('read', subject, '<πεδίο>')` |
| Αν οι γραμμές είναι συγχρονισμένες | `permissions:verify` |
| Την κατάσταση ενός session | `select * from auth where user_id = ?;` (`revoked_at`, `rotated_at`, `version`) |
| Ποια refresh tokens έχουν ήδη χρησιμοποιηθεί | `select * from auth_consumed_refresh_tokens where auth_id = ? order by consumed_at;` |

## 12. Κατάσταση και ανοιχτά θέματα

Όλες οι φάσεις (0–6) έχουν υλοποιηθεί και γίνει commit στο `feat/casl-v2`. Όλα τα ευρήματα του [CASL.Authorization.Review.md](CASL.Authorization.Review.md) (C-01 έως C-10, D-1, D-2) έχουν κλείσει· η ενότητα 10 εκείνου του εγγράφου δείχνει ποια αλλαγή έκλεισε το καθένα.

### Αποφάσεις που περιμένουν τον owner

| Απόφαση | Λεπτομέρεια |
| --- | --- |
| Πρόθεμα routes του auth | Ο controller μετακινήθηκε από `/auth` σε `/auths` (cookie `Path=/auths`), όπως ορίζει το plan. Είτε αλλάζουν τα URLs των clients, είτε το πρόθεμα γυρίζει σε `/auth` μαζί με το path του cookie. |
| Rebase | Το `feat/casl-v2` δεν έχει γίνει rebase πάνω στο `be606e85`. |
| Push και pull requests | Δεν έχει γίνει push. Το PR 1 τελειώνει στο `3452bd19`, το PR 2 στο `6fb44bf7`, το PR 3 είναι ό,τι ακολουθεί. |

### Κενά που υπήρχαν ήδη (όχι από το CASL v2)

- Ο `GetRolesCapabilitiesHandler` δεν έχει έλεγχο CASL στο query bus· προστατεύεται μόνο το route του controller.
- Το `ddd/users-api/test/` έχει 23 type errors· το `test/` είναι εκτός typecheck.
- Ο generator του codebase map εξακολουθεί να περιλαμβάνει το `packages/_old`.
- Το `.claude/codebase-map.md` είναι περίπου 50 KB από όριο 64 KB.

### Γνωστά όρια του σχεδιασμού

- Κανένα transaction δεν καλύπτει μαζί τον έλεγχο δικαιωμάτων και ένα μεταγενέστερο write.
- Ένα access token μετά το logout ισχύει μέχρι το `exp` του (5 λεπτά από προεπιλογή).
- Όποιος γράφει στο `user_roles` ή σε άλλα δεδομένα δικαιωμάτων χωρίς `UserPermissionsProjector.rebuild` αφήνει απόκλιση μέχρι να τη βρει το `permissions:verify`.
- Το authorized pagination (φιλτράρισμα σελίδας με κανόνες οντότητας μέσα στο query) είναι ξεχωριστή δουλειά.
- Με `PERMISSIONS_IN_ACCESS_TOKEN=true`, αλλαγές σε δικαιώματα, τμήμα ή διαγραφή χρήστη ισχύουν από το επόμενο refresh.
