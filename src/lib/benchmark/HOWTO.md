# How to run a benchmark (Path 2: dump from DB)

This is the safe path: you generate estimates through the existing UI as
usual, then dump them to JSON and feed them to the benchmark runner. No
extra API keys, no orchestrator instantiation outside of the request flow.

## TL;DR

```bash
# 1. Generate the estimate through /admin/estimates/ai-generate (UI)
#    using the wizard hints from the case below.
#    Save it. Note the estimate ID from the URL or success page.

# 2. Dump it to JSON:
cd metrum-group
npx tsx scripts/dump-estimate.ts <estimateId> --out=./tmp/sky-bank.json

# 3. Run benchmark metrics against the reference:
npx tsx scripts/run-benchmark.ts --case=sky-bank-lviv --ai=./tmp/sky-bank.json
```

The runner will print a metrics block with `total error`, `section error`,
`item completeness`, `source coverage`, `low-confidence share`, and (for
two-column references) `materials error` / `labor error`.

---

## Case 1 — ARMET офіс на Любінській

**ID:** `armet-office-lubinska`
**Reference total:** 2 102 923 ₴
**PDF:** `teach/1/Дизайн_проєкт_офісу_ARMET_Альбом_креслень_2025_08_19.pdf` (28 MB, 81 pages, TOTO Architects)

Wizard hints when you create the AI estimate:

| Field | Value |
|---|---|
| Object type | office |
| Work scope | renovation |
| Total area | 150.6 m² |
| Floors | 1 |
| Ceiling height | 3.01 m |
| Demolition required | yes (1 partition only) |
| Wall material | газоблок (gasblock) for new partitions |
| Finishing — walls | paint + drywall + LDSP panels + stone veneer |
| Ceiling | suspended Грильято + натяжна |
| Bathroom count | 1 |
| Notes | "12 кімнат: очікування, коридор, гардеробна, санвузол, відділ продажів, фінансовий, CFO, нарад, технічне, архів, кухня, керівництва. 6 скляних перегородок СП-01..06, 4 двері прихованого монтажу. Дизайнерські люстри Nordlux, Pikart." |

Upload the PDF as a project file so the RAG vectorizer pulls it in.

## Case 2 — Sky Bank Львів — відділення

**ID:** `sky-bank-lviv`
**Reference total:** 679 081 ₴ (incl. 20% VAT)
**PDF:** `teach/2/Sky BANK ЛЬВІВ - Sky Bank.pdf` (12 MB, 25 pages, дизайнер Ірина Герус)

| Field | Value |
|---|---|
| Object type | commercial |
| Work scope | renovation |
| Total area | 92.25 m² (89.00 hall + 3.25 bath) |
| Floors | 1 |
| Ceiling height | 3.545 m |
| Demolition required | no |
| Bathroom count | 1 |
| Notes | "Банківське відділення Sky Bank. Існуюча будівля — газоблок + червона цегла + бетонні несучі. Чорнова бетонна стеля з відкритими комунікаціями. Стеля Грильято, килимова плитка. Електрощиток + радіатор + вентканал + пожежна сигналізація вже існують. ПДВ 20%." |

This case is the smallest — start here for your first dump-and-measure run.

## Case 3 — Охматдит, офтальмологія, 5-й поверх

**ID:** `okhmatdyt-ophthalmology`
**Reference total:** 1 253 903 ₴
**PDF:** `teach/3/20250708_РОБОЧИЙ_ДИЗАЙН_ПРОЕКТ_ОХМАТДИТ_5_й_поверх_Офтальмологія.pdf` (26 MB, 60 pages, 5F Studio "Антей")

| Field | Value |
|---|---|
| Object type | commercial (medical) |
| Work scope | renovation (heavy reconstruction) |
| Total area | 334.18 m² |
| Floors | 1 (5-й поверх існуючої будівлі) |
| Demolition required | yes (significant) |
| Bathroom count | 1 |
| Notes | "Львівська обласна дитяча клінічна лікарня (ОХМАТДИТ), 5-й поверх — офтальмологія. 18 приміщень: 6 палат + VIP палата, ізолятор, кабінети директора/медсестри, ортоптична (37.84 м²), маніпуляційна, оглядова, роздавальня. Реконструкція з демонтажем + новими цегляними перегородками + новими дверними прорізами. Медичний вініл (зелений + тераццо), плитка в санвузлі, стеля Армстронг 292 м², скляна перегородка антипаніка." |

The largest and trickiest case — heavy demolition + new partitions + medical
finishing materials. Save this for last when you've calibrated the others.

---

## Reading the metrics output

```
Metrics:
  total error              23.4%        ← |aiTotal - refTotal| / refTotal
  section error (matched)  31.2%   (4 sections matched)
  item completeness        78.0%        ← min(1, aiItems / refItems)
  source coverage          92.0%        ← items with priceSource set
  low-confidence share     14.0%        ← items with confidence < 0.75
  materials error          18.5%        ← only for two-column references
  labor error              27.1%        ← only for two-column references
```

What "good" looks like (rough thresholds — calibrate after first run):

| Metric | Bad | OK | Good |
|---|---|---|---|
| total error | > 50% | 25–50% | < 25% |
| section error | > 60% | 30–60% | < 30% |
| item completeness | < 50% | 50–75% | > 75% |
| source coverage | < 60% | 60–80% | > 80% |
| low-confidence share | > 30% | 15–30% | < 15% |

After a couple of runs, save the best metrics as `baseline.json` and treat
each PR as a regression check against it.

## Troubleshooting

* **`Estimate ... not found`** — wrong ID, or the estimate was deleted.
  Open `prisma studio`, find the row in `estimates`, copy the `id`.
* **Section error is `—`** — the runner couldn't match any section titles
  between AI and reference. The titles must overlap on lower-cased,
  punctuation-stripped tokens. Check the AI output: did the orchestrator
  emit "Електрика" while the reference says "Електромонтажні роботи"?
* **Source coverage is 0%** — items are missing `priceSource`. This means
  the price engine fell through to LLM fallback for everything; check the
  catalog provider on the dev server.
