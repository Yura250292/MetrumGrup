# Beta Readiness Checklist — ERP / SRM

## 1. Мета документа

Цей документ фіксує, що саме потрібно доробити перед запуском Beta-версії продукту як ERP / SRM платформи для реального користування.

Документ побудований на основі фактичного аналізу поточного коду, API, Prisma-схеми, тестового покриття, `admin-v2` UI, внутрішніх roadmap/delivery docs і явних TODO/Phase B хвостів у репозиторії.

Ціль:

- відокремити критичні release blockers від бажаних покращень;
- зафіксувати реальний Beta scope;
- не намагатися викотити весь продукт як "готовий", якщо частина модулів ще не замкнена в повний операційний цикл;
- дати команді робочий checklist для релізу.

---

## 2. Executive Summary

### Поточний стан

Продукт уже має сильне ядро ERP / SRM:

- `Projects`
- `Estimates`
- `Financing`
- `Counterparties / SRM`
- `Receipts / Documents`
- `RFI`
- `Change Orders`
- `Foreman reports`
- `Meetings`
- частково `Procurement / RFQ / PO`

Архітектурно це вже не MVP, а великий внутрішній platform-контур.

### Головна проблема

Різні модулі мають різний рівень зрілості:

- частина вже близька до Beta-ready;
- частина технічно існує, але ще потребує product hardening;
- частина має backend/domain layer, але ще не завершена як користувацький операційний цикл.

### Висновок

Рекомендується запускати:

- **не "всю ERP/SRM систему одразу"**
- а **Controlled Closed Beta ERP Core**

з чітко обмеженим функціональним scope.

---

## 3. Рекомендований Beta Scope

### 3.1. Включити в першу Beta

Ці модулі рекомендовано включити в `Closed Beta`:

1. `Projects`
2. `Estimates`
3. `Financing`
4. `Counterparties / SRM`
5. `Receipts`
6. `Documents`
7. `RFI`
8. `Change Orders`

### 3.2. Включати обережно

Ці модулі можна дати обмеженій групі користувачів після окремої перевірки сценаріїв:

1. `Foreman reports`
2. `Forms / Form submissions`
3. `Meetings`
4. `HR basic flows`

### 3.3. Не заявляти як готове ядро Beta

Ці модулі **не варто включати в основний promise першої Beta**, поки не буде завершено повний операційний цикл:

1. `Procurement / Purchase Requests / RFQ / Purchase Orders`
2. `Advanced meetings AI workflows`
3. `Expanded owner analytics`
4. `Advanced HR contour`
5. `Experimental AI tools`

---

## 4. Release Decision

### Recommendation

Запускати:

- **Closed Beta**
- на 1-2 внутрішні або дружні команди
- з обмеженим модульним scope
- після закриття всіх `P0`

Не запускати:

- широкий відкритий Beta rollout
- позиціонування системи як повністю завершеної ERP/SRM платформи
- rollout procurement як production-ready модуля

---

## 5. P0 — Critical Before Beta

Це обов'язкові задачі. Якщо хоча б один із цих блоків не закритий, Beta запускати не варто.

### P0.1. Привести quality gates у робочий стан

**Проблема**

Поточний `lint` не green. Є велика кількість проблем, включно з реальними runtime-ризиками:

- conditional hooks
- ref mutation during render
- setState in effect anti-patterns
- React correctness issues

**Що зробити**

1. Довести `npm run lint` хоча б до green по `errors`.
2. Довести `npm run typecheck` до green.
3. Зафіксувати мінімальний CI gate:
   - `typecheck`
   - `lint`
   - `unit tests`

**Owner**

- `Frontend Lead`
- `Tech Lead`

**Done criteria**

- `npm run lint` не падає по errors
- `npm run typecheck` проходить
- реліз не можна злити в main при red checks

---

### P0.2. Зафіксувати Beta scope на рівні продукту

**Проблема**

Якщо запустити всю систему як Beta без scope control, користувачі підуть у модулі, які ще не завершені або мають Phase B хвости.

**Що зробити**

1. Зафіксувати список модулів `included in beta`.
2. Зафіксувати список модулів `hidden / not promised / internal only`.
3. Сховати або помітити як internal/coming later все, що не входить у Beta scope.

**Owner**

- `Product Owner`
- `Tech Lead`

**Done criteria**

- є затверджений список Beta modules
- у меню/UX немає двозначності щодо прихованих або неготових модулів

---

### P0.3. Провести повний ACL / authorization audit

**Проблема**

У проєкті багато API routes, guard-логіка еволюціонувала нерівномірно, є різні стилі role checks і firm checks.

Для ERP/SRM це критично:

- фінансові дані
- cross-firm data
- client/user visibility
- public token flows

**Що зробити**

1. Провести повний audit `src/app/api/admin/**` і `src/app/api/public/**`.
2. Перевірити:
   - `role`
   - `firm scope`
   - `project access`
   - `finance visibility`
   - `public token safety`
3. Уніфікувати guard-патерни.
4. Перекрити:
   - cross-firm leakage
   - over-permissive USER/CLIENT access
   - несанкціоновані diagnostics/admin endpoints

**Owner**

- `Backend Lead`
- `Security owner`

**Done criteria**

- є зафіксований ACL audit checklist
- усі admin/public routes мають явний auth/role/scope guard
- проведено ручну перевірку мінімум по ролях:
  - `SUPER_ADMIN`
  - `MANAGER`
  - `ENGINEER`
  - `FINANCIER`
  - `HR`
  - `FOREMAN`
  - `CLIENT`
  - `USER`

---

### P0.4. Реалізувати повний password recovery flow

**Проблема**

Сторінка відновлення паролю зараз є, але фактично recovery flow не реалізований.

**Що зробити**

1. Зробити реальний forgot-password flow:
   - reset token
   - expiry
   - single use
   - email delivery
2. Додати backend endpoints.
3. Додати аудит security-подій.

**Owner**

- `Backend`
- `Frontend`

**Done criteria**

- користувач може відновити пароль без ручної допомоги команди
- токен одноразовий
- є expiry
- є success/failure UX

---

### P0.5. Заборонити soft-fail міграцій при build/release

**Проблема**

Поточна логіка деплою не повинна продовжувати release, якщо `migrate deploy` впав.

**Що зробити**

1. Прибрати soft-fail для міграцій.
2. Зробити fail-fast release policy.
3. Перевірити staging → prod migration process.

**Owner**

- `DevOps`
- `Tech Lead`

**Done criteria**

- release падає, якщо міграція не застосувалась
- staging/prod rollout має явний migration step

---

### P0.6. Не включати procurement у Beta, поки не замкнено весь цикл

**Проблема**

`Procurement / RFQ / PO` уже частково є на рівні схеми та API, але має явні незавершені стики:

- supplier invite emails
- reminder emails
- winner/loser notifications
- finance sync after award / delivery
- incomplete user-facing admin contour

**Що зробити**

Вибрати один із двох варіантів:

1. Або **тимчасово виключити procurement із Beta**
2. Або **доробити повний цикл до production-ready стану**

**Owner**

- `Product Owner`
- `Backend Lead`
- `Frontend Lead`

**Done criteria**

Один із двох:

- procurement прихований / internal only
- або procurement проходить повний сценарій:
  - create PR
  - send RFQ
  - supplier bid submit
  - compare bids
  - award
  - create PO
  - confirm delivery
  - finance sync
  - notifications

---

### P0.7. Мінімальний e2e smoke pack для Beta-core

**Проблема**

Юніт-тести є, але для реального Beta запуску цього недостатньо.

**Що зробити**

Покрити хоча б базові критичні сценарії:

1. login
2. create project
3. create estimate
4. approve / move estimate
5. sync estimate to financing
6. create finance entry
7. upload receipt
8. open/edit counterparty dossier
9. create RFI
10. answer/close RFI
11. create change order
12. public RFQ bid submit, якщо procurement входить у scope

**Owner**

- `QA`
- `Frontend`
- `Backend`

**Done criteria**

- є smoke suite
- вона запускається перед Beta release
- вона покриває core user journeys

---

## 6. P1 — Strongly Recommended Before Beta

Це не абсолютні blockers, але сильно впливають на якість першої Beta.

### P1.1. Вирівняти audit coverage на всіх критичних mutation flows

**Проблема**

`auditLog` використовується, але нерівномірно. Для ERP/SRM потрібна стабільна простежуваність змін.

**Що зробити**

1. Зібрати перелік критичних мутацій:
   - фінанси
   - зміна статусів
   - прив'язка контрагентів
   - approvals
   - imports
   - file actions
2. Переконатися, що всі вони пишуть аудит.
3. Додати логування публічних supplier actions, якщо procurement у scope.

**Owner**

- `Backend`

**Done criteria**

- є audit coverage matrix
- усі критичні mutation flows покриті

---

### P1.2. Help / onboarding для складних модулів

**Проблема**

Система широка і складна. Без контекстного пояснення користувачі губляться.

**Що зробити**

1. Доробити help-system для:
   - `Financing`
   - `Projects`
   - `Estimates`
   - `Counterparties`
   - `Receipts`
   - `RFI`
   - `Change Orders`
2. Включити:
   - page intro
   - contextual help
   - guided tours

**Owner**

- `Frontend`
- `Product Designer`

**Done criteria**

- основні Beta-модулі мають короткий intro/help layer
- user може самостійно зрозуміти призначення сторінки і початкові кроки

---

### P1.3. Support / operations runbooks

**Проблема**

У Beta з'являються не тільки баги, а й питання "що робити, якщо процес завис / зламався".

**Що зробити**

Підготувати runbooks для:

1. estimate generation failed
2. receipt not recognized
3. financing import partially committed
4. document upload failed
5. RFI stuck
6. supplier did not receive invite
7. change order stuck in status

**Owner**

- `Product Ops`
- `Support lead`
- `Backend`

**Done criteria**

- є короткі internal runbooks
- support/admin знає, як відновити основні сценарії без залучення core-dev на кожному кейсі

---

### P1.4. User-facing error quality

**Проблема**

Складні системи без якісних помилок швидко стають "чорним ящиком" для Beta-користувача.

**Що зробити**

1. Перевірити критичні форми й API flows.
2. Нормалізувати:
   - validation messages
   - conflict messages
   - permission messages
   - empty states
   - retry states

**Owner**

- `Frontend`
- `Product`

**Done criteria**

- на ключових Beta flow користувач бачить зрозумілі помилки й наступну дію

---

### P1.5. Security baseline hardening

**Що зробити**

1. Rate-limit auth-sensitive endpoints.
2. Перевірити file upload policies.
3. Перевірити public token endpoints.
4. Перевірити diagnostic endpoints.
5. Визначити політику 2FA rollout:
   - або відкласти офіційно
   - або включити для internal admin roles

**Owner**

- `Security owner`
- `Backend`

**Done criteria**

- базовий security checklist пройдений
- немає відомих high-risk exposure без прийнятого винятку

---

## 7. P2 — Can Be Post-Beta

Це важливо, але не повинно блокувати перший Controlled Beta запуск.

1. Повне доведення procurement automation
2. Розширені owner analytics
3. Advanced AI copilots
4. Full HR maturity
5. Native mobile contour
6. BAS / 1C integration
7. Multi-language help/content CMS
8. Advanced reporting / BI exports

---

## 8. Module Readiness Matrix

| Module | Readiness | Recommendation |
|---|---|---|
| Projects | High | Include in Beta |
| Estimates | High | Include in Beta |
| Financing | High / Medium | Include in Beta after ACL + UX hardening |
| Counterparties / SRM | High / Medium | Include in Beta |
| Receipts | Medium | Include with smoke tests |
| Documents | Medium | Include with smoke tests |
| RFI | Medium / High | Include in Beta |
| Change Orders | Medium / High | Include in Beta |
| Foreman Reports | Medium | Limited Beta only |
| Meetings | Medium | Limited Beta only |
| Forms | Medium | Limited Beta only |
| HR | Medium / Low | Not core Beta promise |
| Procurement / RFQ / PO | Medium at backend, Low as full product flow | Exclude or finish before Beta |

---

## 9. Owners Matrix

| Area | Suggested Owner |
|---|---|
| Beta scope definition | Product Owner |
| Quality gates / CI | Tech Lead |
| Lint / frontend correctness | Frontend Lead |
| ACL / role / firm audit | Backend Lead |
| Auth / password reset | Backend |
| Migration safety / release process | DevOps |
| Smoke e2e pack | QA Lead |
| Support runbooks | Product Ops |
| Help / onboarding | Product Designer + Frontend |
| Audit coverage | Backend |
| Security baseline | Security owner |

---

## 10. Final Go / No-Go Checklist

Перед Beta release відповідь на всі `P0` має бути `YES`.

### P0 Go / No-Go

- [ ] `lint` green по errors
- [ ] `typecheck` green
- [ ] мінімальний CI gate увімкнено
- [ ] Beta scope затверджений
- [ ] procurement або виключений із Beta, або замкнений end-to-end
- [ ] ACL audit завершений
- [ ] password recovery працює
- [ ] migration release policy fail-fast
- [ ] smoke e2e pack пройдений

### P1 Readiness

- [ ] audit coverage matrix закрита
- [ ] help/onboarding реалізований для core modules
- [ ] support runbooks готові
- [ ] user-facing errors перевірені
- [ ] security baseline checklist пройдений

### Release Decision

- [ ] `GO`
- [ ] `NO-GO`

---

## 11. Practical Rollout Plan

### Stage 1. Internal hardening

1. Закрити всі `P0`
2. Прогнати smoke suite
3. Провести ручний сценарний test pass по Beta modules

### Stage 2. Closed beta

1. 1-2 внутрішні або дружні команди
2. Чітко обмежений scope
3. Відстеження:
   - bugs
   - stuck flows
   - непотрібні дії support
   - UX confusion

### Stage 3. Beta expansion

1. Доробити `P1`
2. Вирішити, чи входить procurement у наступну хвилю
3. Розширювати rollout на нові ролі / підрозділи

---

## 12. Підсумок

Система вже достатньо сильна, щоб готувати **керовану Beta**.

Але для чесного запуску потрібен не "ще один красивий модуль", а дисципліна в 5 точках:

1. quality gates
2. ACL / security
3. завершені user flows
4. supportability
5. жорсткий Beta scope

Після закриття `P0` продукт можна обережно викочувати як `Closed Beta ERP Core`.
