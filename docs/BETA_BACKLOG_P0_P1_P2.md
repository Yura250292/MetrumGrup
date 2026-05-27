# Beta Backlog — P0 / P1 / P2

## 1. Призначення

Цей документ доповнює [BETA_READINESS_CHECKLIST.md](./BETA_READINESS_CHECKLIST.md) і переводить висновки у формат backlog-задач для розробки, QA, дизайну, support і release management.

Ціль:

- розкласти Beta readiness на конкретні work items;
- дати матеріал для Jira / Linear;
- зафіксувати очікуваний результат кожного блоку;
- допомогти команді не змішувати blockers і nice-to-have покращення.

---

## 2. Epic Structure

Рекомендована структура epic-ів:

1. `BETA-CORE-QUALITY`
2. `BETA-SECURITY-ACL`
3. `BETA-AUTH-RECOVERY`
4. `BETA-CORE-FLOWS`
5. `BETA-OBSERVABILITY-SUPPORT`
6. `BETA-UX-ONBOARDING`
7. `BETA-PROCUREMENT-DECISION`

---

## 3. P0 Backlog

## Epic: `BETA-CORE-QUALITY`

### Task P0-Q1. Fix release-blocking lint errors

**Problem**

У коді є lint errors, які включають реальні React/runtime anti-patterns.

**Scope**

- conditional hooks
- refs mutated during render
- setState inside effects
- broken hook dependency patterns
- очевидні correctness issues у нових help/dashboard компонентах

**Files / zones to inspect first**

- `src/app/admin-v2/_components/dashboard/*`
- `src/app/admin-v2/_components/help/*`
- auth pages
- profile/help/client state components

**Output**

- `npm run lint` green по errors

**Acceptance Criteria**

- lint errors = `0`
- якщо warnings залишаються, вони документовані і не є release risk

**Owner**

- `Frontend Lead`

---

### Task P0-Q2. Make typecheck green

**Problem**

Потрібен стабільний `typecheck` як release gate.

**Scope**

- production code
- test typing
- tsconfig boundaries
- imports/route contracts

**Output**

- `npm run typecheck` проходить без помилок

**Acceptance Criteria**

- typecheck green локально
- typecheck green у CI

**Owner**

- `Frontend`
- `Backend`

---

### Task P0-Q3. Introduce mandatory CI release gate

**Problem**

Без єдиного CI gate Beta буде нестабільною навіть після локальних фіксів.

**Scope**

- `typecheck`
- `lint`
- `unit tests`

**Output**

- merge/release policy, що не дозволяє shipping при red checks

**Acceptance Criteria**

- є задокументований CI gate
- release branch не проходить без green checks

**Owner**

- `Tech Lead`
- `DevOps`

---

## Epic: `BETA-SECURITY-ACL`

### Task P0-S1. Audit all admin API routes

**Problem**

У проєкті багато `admin` API routes з різними guard-патернами.

**Scope**

- `src/app/api/admin/**`

**Checklist**

Перевірити для кожного route:

1. auth required
2. role guard
3. firm scope guard
4. project scope guard where needed
5. finance visibility guard where needed
6. upload permissions
7. diagnostic endpoint safety

**Output**

- ACL audit table по всіх admin routes

**Acceptance Criteria**

- не залишилось route без явної моделі доступу
- зафіксовані owner-approved exceptions

**Owner**

- `Backend Lead`

---

### Task P0-S2. Audit all public token routes

**Problem**

Public token routes у SRM/procurement вимагають окремого security review.

**Scope**

- `src/app/api/public/**`

**Checklist**

1. token entropy
2. anti-enumeration behavior
3. rate limiting
4. data minimization in response
5. replay / resubmission behavior
6. IP/audit strategy

**Acceptance Criteria**

- усі public routes reviewed
- усі high-risk findings або виправлені, або formally accepted

**Owner**

- `Security owner`
- `Backend`

---

### Task P0-S3. Normalize authorization helpers

**Problem**

Guard-логіка розкидана між manual checks і helper’ами.

**Scope**

- `auth-utils`
- `firm scope`
- project access
- finance access

**Output**

- канонічний набір helper’ів

**Acceptance Criteria**

- нові й критичні routes користуються уніфікованою guard-моделлю
- legacy manual checks мінімізовані або позначені

**Owner**

- `Backend Lead`

---

## Epic: `BETA-AUTH-RECOVERY`

### Task P0-A1. Implement forgot-password backend flow

**Problem**

Password recovery зараз не реалізований.

**Scope**

1. generate reset token
2. persist token securely
3. expiry
4. one-time use
5. submit new password

**Acceptance Criteria**

- токен діє обмежений час
- токен одноразовий
- invalid/expired token дає коректну відповідь

**Owner**

- `Backend`

---

### Task P0-A2. Implement forgot-password email delivery

**Problem**

Без реального email delivery flow reset не працює для користувача.

**Scope**

- email template
- delivery service integration
- anti-leak UX messaging

**Acceptance Criteria**

- користувач отримує лист
- система не розкриває, чи email існує

**Owner**

- `Backend`
- `Product Ops`

---

### Task P0-A3. Implement forgot-password UI flow

**Problem**

Поточна сторінка success-only імітує роботу.

**Scope**

- request reset screen
- reset password screen
- success/failure states

**Acceptance Criteria**

- flow можна пройти end-to-end без ручної допомоги команди

**Owner**

- `Frontend`

---

## Epic: `BETA-CORE-FLOWS`

### Task P0-F1. Freeze Beta module scope in navigation and UX

**Problem**

Користувачі не повинні потрапляти у модулі, які не входять у Beta promise.

**Scope**

- `admin-v2` nav
- header shortcuts
- dashboard entry points
- internal routes visibility

**Acceptance Criteria**

- у користувацькому UI видно лише agreed Beta modules
- internal-only flows приховані або clearly marked

**Owner**

- `Product Owner`
- `Frontend`

---

### Task P0-F2. Build smoke test suite for Beta-core

**Problem**

Потрібно швидко перевіряти, що ядро не зламане перед кожним release.

**Suggested smoke flows**

1. login
2. create project
3. open project
4. create estimate
5. save estimate
6. sync estimate to financing
7. add finance entry
8. upload receipt
9. open counterparty dossier
10. create RFI
11. answer RFI
12. create change order

**Acceptance Criteria**

- smoke suite автоматизована
- проходить у staging

**Owner**

- `QA`
- `Frontend`
- `Backend`

---

### Task P0-F3. Decide procurement status for Beta

**Problem**

Procurement існує частково, але ще не повністю замкнений у finished user journey.

**Decision options**

1. Exclude from Beta
2. Finish before Beta

**Acceptance Criteria**

Є одне чітке рішення:

- або procurement hidden/internal only
- або procurement officially Beta-ready

**Owner**

- `Product Owner`
- `Tech Lead`

---

### Task P0-F4. If procurement stays in Beta, close Phase B gaps

**Do only if procurement included**

**Gaps to close**

1. supplier invitation email
2. reminder email
3. winner / loser notifications
4. finance sync after award
5. finance sync after delivery
6. complete admin UI for PR / RFQ / PO
7. public event/audit trail

**Acceptance Criteria**

- procurement проходить повний e2e user journey
- немає Phase B TODO на критичних стиках

**Owner**

- `Backend`
- `Frontend`
- `Product`

---

## Epic: `BETA-OBSERVABILITY-SUPPORT`

### Task P0-O1. Remove soft-fail migration policy

**Problem**

Реліз не повинен продовжуватись після failed migration.

**Acceptance Criteria**

- migration failure stops release
- rollback / remediation path documented

**Owner**

- `DevOps`

---

### Task P0-O2. Verify production build and release path

**Scope**

- local prod build
- staging build
- env validation
- Prisma migration path
- runtime restrictions

**Acceptance Criteria**

- staging deploy reproducible
- production deploy path documented

**Owner**

- `DevOps`
- `Tech Lead`

---

## 4. P1 Backlog

## Epic: `BETA-OBSERVABILITY-SUPPORT`

### Task P1-O1. Audit critical mutation logging

**Scope**

Перевірити audit coverage для:

1. фінансових записів
2. статусних переходів
3. estimate mutations
4. project mutations
5. RFI lifecycle
6. change order lifecycle
7. document/receipt approval flows
8. counterparty edits

**Acceptance Criteria**

- є matrix: action → audited yes/no
- усі high-value mutations логуються

**Owner**

- `Backend`

---

### Task P1-O2. Create support runbooks

**Runbooks**

1. login/recovery issues
2. estimate generation failures
3. financing import failure
4. receipt OCR failure
5. document upload failure
6. stuck RFI / stuck CO
7. supplier flow issues, якщо procurement у scope

**Acceptance Criteria**

- support може відпрацювати типові Beta інциденти без ескалації в core-dev у кожному кейсі

**Owner**

- `Product Ops`
- `Support`

---

### Task P1-O3. Beta bug triage process

**Problem**

Після запуску Beta потрібен чіткий процес інцидентів.

**Scope**

- severity rubric
- response SLA
- owner assignment
- rollback/escalation

**Acceptance Criteria**

- є agreed triage flow
- кожен bug має severity та owner

**Owner**

- `Product Owner`
- `Tech Lead`

---

## Epic: `BETA-UX-ONBOARDING`

### Task P1-U1. Ship help system for Beta-core pages

**Priority pages**

1. `Financing`
2. `Projects`
3. `Estimates`
4. `Counterparties`
5. `Receipts`
6. `RFI`
7. `Change Orders`

**Acceptance Criteria**

- на кожній core page є page intro/help access
- є хоча б 1-2 guided flows для найскладніших сценаріїв

**Owner**

- `Frontend`
- `Product Designer`

---

### Task P1-U2. Improve empty states and first-use states

**Problem**

Складна ERP без guide state часто виглядає як "порожній список без підказки".

**Scope**

- no projects
- no estimates
- no finance entries
- no counterparty reviews
- no receipts
- no RFI

**Acceptance Criteria**

- порожні екрани пояснюють, що робити далі

**Owner**

- `Frontend`
- `Design`

---

### Task P1-U3. Normalize user-facing errors on core flows

**Scope**

- form validation
- permission errors
- not found
- conflict states
- retry states

**Acceptance Criteria**

- errors on Beta-core flows зрозумілі користувачу і дають наступну дію

**Owner**

- `Frontend`

---

## Epic: `BETA-SECURITY-ACL`

### Task P1-S1. Add auth-sensitive rate limits

**Scope**

- login-related endpoints
- password reset
- public token writes
- upload-heavy endpoints where needed

**Acceptance Criteria**

- brute-force/practical abuse scenarios rate-limited

**Owner**

- `Backend`
- `Security owner`

---

### Task P1-S2. Review file upload safety

**Scope**

- mime checks
- size limits
- scope restrictions
- signed URL policies
- content-type assumptions

**Acceptance Criteria**

- upload policy documented
- high-risk upload gaps closed

**Owner**

- `Backend`

---

## 5. P2 Backlog

### Task P2-1. Full procurement productization

Complete:

1. PR list/detail UX
2. RFQ matrix UI
3. PO lifecycle UI
4. supplier communications
5. finance/warehouse downstream integrations

**Owner**

- `Frontend`
- `Backend`

---

### Task P2-2. Advanced meetings product hardening

**Owner**

- `Frontend`
- `AI/Backend`

---

### Task P2-3. Extended HR operations

**Owner**

- `Backend`
- `Frontend`

---

### Task P2-4. Owner analytics hardening

**Owner**

- `Frontend`
- `Backend`

---

### Task P2-5. 2FA rollout

Use existing TOTP groundwork, but treat as controlled post-Beta rollout unless elevated to P1 by policy.

**Owner**

- `Security owner`
- `Backend`
- `Frontend`

---

## 6. Suggested Sprint Order

### Sprint A — Release blockers

1. lint errors
2. typecheck
3. CI gate
4. migration fail-fast
5. password reset

### Sprint B — Security and scope

1. ACL audit
2. public route audit
3. scope freeze in UI
4. procurement go/no-go

### Sprint C — Reliability

1. smoke suite
2. audit matrix
3. support runbooks
4. error normalization

### Sprint D — Beta polish

1. help/onboarding
2. empty states
3. documentation and release prep

---

## 7. Ready for Jira / Linear Template

Для кожної задачі рекомендується картка такого формату:

### Title

`[BETA][P0] Fix release-blocking lint errors in admin-v2 help/dashboard components`

### Description

- Problem
- Why it blocks Beta
- Technical scope
- Acceptance Criteria
- Dependencies

### Labels

- `beta`
- `p0` / `p1` / `p2`
- `frontend` / `backend` / `security` / `qa` / `ops`

### Definition of Done

- code merged
- tests updated
- docs updated if needed
- manually verified in staging

---

## 8. Final Recommendation

Працювати не від списку "все, що ще хочеться зробити", а від такого порядку:

1. **спершу release safety**
2. **потім access/security**
3. **потім core journeys**
4. **потім supportability**
5. **лише після цього polish**

Це дозволить вийти в Beta швидше й без ілюзії, що продукт готовий там, де він ще лише частково сформований.
