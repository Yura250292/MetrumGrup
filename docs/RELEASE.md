# Release Policy

Defines the mandatory gate between merge to `main` and production deploy. Closes acceptance criteria for `BETA_BACKLOG_P0_P1_P2.md` tasks **P0-Q3** (CI release gate) and **P0-O1** (no soft-fail migrations).

## CI Gate (P0-Q3)

`/.github/workflows/ci.yml` runs on every `push` to `main` and every `pull_request` targeting `main`. Required jobs (all must pass before merge):

1. `npx prisma generate`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run test:ci`

### Branch protection

`main` must have the following GitHub branch protection rules enabled (configure in repository **Settings → Branches**):

- Require status check `quality / Lint, Typecheck, Test` to pass
- Require branches to be up to date before merging
- Disallow force pushes
- Disallow deletions

Without these rules CI is informational only. The rules are the gate.

### Owner

`Tech Lead` is responsible for keeping CI green on `main`. If a check turns red, no further merges until it is fixed.

## Migration Policy (P0-O1)

Vercel `buildCommand` runs `prisma migrate deploy && prisma generate && next build`. A migration failure now **stops the build**, and therefore the release. The previous soft-fail (`|| echo`) has been removed.

### Rollback path

1. Identify failing migration from Vercel build logs.
2. Revert the offending migration in a hotfix branch (drop the file or generate an inverse migration).
3. Open PR → CI must pass → merge → Vercel redeploys.
4. If prod DB is in a partial state, coordinate with DB owner before applying further migrations. See `CLAUDE.md` "🚨 База даних — НЕБЕЗПЕЧНІ команди".

### Local migration safety

- Generate migration files only against a local throwaway DB.
- **Never** pass production `DATABASE_URL` as `--shadow-database-url` — Prisma resets the shadow target (incident 2026-05-22).
- `~/.claude/hooks/db-guard.sh` blocks destructive Prisma calls inside Claude Code Bash. It does **not** guard the Vercel pipeline — the buildCommand fix above is what guards production.

## Lint Policy

- Errors must be `0` to merge (CI fails otherwise).
- Warnings are tolerated for now; they must not increase. Owner: `Frontend Lead`.

## Typecheck Policy

- `npm run typecheck` must be `0` errors. Currently green; CI keeps it that way.

## Definition of "ready to deploy"

A commit on `main` is deployable when:

- [x] CI `quality` job is green
- [x] Migration plan (if any) reviewed by Backend Lead
- [x] `RESEND_API_KEY`, `DATABASE_URL`, and other prod env vars set in Vercel
- [x] Release notes appended (informal — Jira/Linear ticket link is enough)
