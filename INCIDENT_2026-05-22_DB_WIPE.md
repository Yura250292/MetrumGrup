# INCIDENT — Production database wiped — 2026-05-22

**Severity:** Critical — full production data loss
**Status:** Recovery in progress — awaiting Railway Support

---

## Summary

The production PostgreSQL database had its entire `public` schema dropped
(all tables, types, and the `_prisma_migrations` table) by an accidental
Prisma command that pointed `prisma migrate diff --shadow-database-url`
at the **production** database. Prisma resets ("wipes") any database passed
as a shadow database before replaying migrations into it.

---

## Affected system

| | |
|---|---|
| Railway project | caring-cat |
| Environment | production |
| Service | Postgres (`ghcr.io/railwayapp-templates/postgres-ssl:18`) |
| Region | EU West (Amsterdam, Netherlands) |
| Public endpoint | `hopper.proxy.rlwy.net:39073` |
| Internal endpoint | `postgres.railway.internal:5432` |
| Database name | `railway` |
| Volume | `postgres-volume` |

---

## Timeline (2026-05-22, times in UTC; Kyiv = UTC+3)

| UTC | Kyiv | Event |
|---|---|---|
| ~05:00–08:10 | ~08:00–11:10 | Normal work session — schema change applied via `prisma db push`, staff/payroll import (223 employees, 110 payroll periods). Production fully intact and serving traffic. |
| ~08:14 | 11:14 | Last confirmed healthy state — production UI showing full data (employees, dossier, salary). |
| **~08:18–08:22** | **~11:18–11:22** | **INCIDENT.** `prisma migrate diff` executed with `--shadow-database-url` set to the **production** `DATABASE_URL`. Prisma reset the database: `DROP SCHEMA public CASCADE` → all ~200+ tables, types and `_prisma_migrations` dropped. Prisma then began replaying 88 migration files into the emptied DB and failed at the first one (`20250331_add_tax_breakdown_fields`, error P3006 / P1014 "table estimates does not exist"). |
| ~08:22–08:24 | 11:22–11:24 | Discovery. Diagnostic queries confirmed `public` schema empty, `_prisma_migrations` absent, database logical size = **9.5 MB (9534 kB)**. |
| 08:24 | 11:24 | A **manual** backup was created — **AFTER** the incident. It captures the empty database. (1.11 GB = physical volume size, not data.) |
| 08:26 | 11:26 | Railway dashboard → Database → Data confirmed: "You have no tables". |

---

## Exact command that caused the loss

```
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "<PRODUCTION_DATABASE_URL>" \
  --script
```

The `--shadow-database-url` flag designates a scratch database that Prisma
**resets (drops all objects in)** before replaying migrations. The production
DATABASE_URL was passed there by mistake.

---

## Current database state

- `public` schema: **0 user tables**
- `_prisma_migrations`: **absent**
- Database logical size: **9.5 MB** (empty)
- `prisma migrate status`: all 88 migrations reported "not yet applied"

---

## Backup state

- **No backup schedule was configured** on the Postgres service.
- The only backup present (`2026-05-22 08:24 UTC`, 1.11 GB) was created
  **after** the incident and contains the **empty** database. It is NOT
  usable for recovery.

---

## What we need from Railway Support

1. **Any infrastructure-level / GCP persistent-disk snapshot** of
   `postgres-volume` taken **before 08:18 UTC, 2026-05-22**.
2. If no snapshot exists — **block-level / forensic recovery** of the volume.
   The `DROP SCHEMA` only unlinks the relation files; the data is likely
   still **physically present** on the disk until overwritten by new writes.
3. **CRITICAL: do not allow the volume to be overwritten or re-initialised.**
   - Do NOT restore the post-incident backup (it would overwrite the volume).
   - The Postgres service should be stopped to halt all further writes.

---

## Preventive actions (post-recovery)

- Never pass a production URL to `--shadow-database-url`. Use a dedicated
  throwaway database, or `prisma migrate dev` against a local DB only.
- Configure an automatic Railway backup schedule (daily minimum).
- Restrict the production `DATABASE_URL` to deploy-time only; use a separate
  read-only / non-prod URL for local tooling.
