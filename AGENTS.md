# AGENTS.md

This file is the primary agent entrypoint for this repository.

All coding agents working in this repo should read this file first, then use:

- `ARCHITECTURE_FOR_CLAUDE.md` for the full architecture context
- `PRODUCTION_REVIEW.md` for the production audit and fix priorities

## Project identity

This repository is a full-stack monolith for `Metrum Group`.

It combines:

- a public marketing website
- an internal admin/CRM/ERP application
- a client dashboard
- estimate generation and finance workflows
- project operations, resources, payments, photos, and documents

Do not treat this repo as a frontend-only site.

## Required architectural assumptions

Agents must assume the following unless the code clearly proves otherwise:

### 1. Deployment model

Target production architecture:

- `Vercel` for app hosting and runtime
- `Railway PostgreSQL` for the main database
- `Cloudflare R2` for file storage

Important:

- PostgreSQL is already a real core dependency in code
- R2 is a target storage architecture and is partially reflected in docs/env checks
- R2 is not yet fully implemented as a complete storage abstraction in the application code

Do not assume file upload/storage is finished unless you verify the code path.

### 2. Runtime model

This is a `Next.js App Router` full-stack application.

Backend responsibilities live inside this repo via:

- `src/app/api/*`
- server components
- `src/lib/*`
- Prisma

Do not look for a separate backend service unless explicitly introduced later.

### 3. Product zones

The app has 3 major zones:

- `/` public marketing site
- `/admin/*` internal company operations
- `/dashboard/*` client-facing dashboard

Changes in one zone may affect shared auth, layout, database, and access-control assumptions.

### 4. Database truth

The Prisma schema is the source of truth for the domain model.

Before changing business logic, always verify:

- `prisma/schema.prisma`

### 5. Access control

Never rely only on page redirects or UI visibility for security.

When changing or adding API routes:

- verify role checks explicitly
- verify ownership checks explicitly
- assume ACL is security-critical

### 6. AI features

Estimate AI flows are runtime-sensitive.

When changing AI-related code, always consider:

- timeout limits
- payload size
- JSON parsing reliability
- model-specific env vars
- failure behavior

### 7. CMS vs current public site

CMS-like entities exist in the schema, but the public site is still heavily hardcoded.

Do not assume the landing page is already fully driven by CMS data.

## Files agents should use

### Primary architecture reference

- `ARCHITECTURE_FOR_CLAUDE.md`

Use it for:

- product overview
- folder structure
- domain model
- deployment model
- auth/API/storage understanding

### Production quality and risk reference

- `PRODUCTION_REVIEW.md`

Use it for:

- known production risks
- ACL issues
- AI route issues
- build/lint/typecheck notes
- recommended fix order

## Working defaults for agents

When making changes, prefer these defaults:

- preserve monolith structure unless refactor is intentional
- keep business logic close to `src/lib/*` instead of bloating route handlers
- treat Prisma schema changes as high-impact
- treat auth and API changes as security-sensitive
- treat file-storage work as incomplete until R2 integration is explicitly implemented

## If you need the full repo explanation

Read:

- `ARCHITECTURE_FOR_CLAUDE.md`

If you need production constraints and known problems, also read:

- `PRODUCTION_REVIEW.md`
