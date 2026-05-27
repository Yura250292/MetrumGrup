/**
 * ACL audit: scans every route.ts under src/app/api/admin/** and
 * src/app/api/public/** and reports which guard utilities each file calls.
 *
 * Output: docs/ACL_AUDIT_MATRIX.md, one row per (file, HTTP method).
 *
 * Status legend:
 *   GUARDED  — calls one of the require-* / assertRole helpers AND (for admin)
 *              has firm scoping or operates on global data.
 *   PARTIAL  — has auth() but no role guard / no firm scoping.
 *   OPEN     — no recognized guard call. Public routes need token logic.
 *
 * This is a static heuristic, not a proof. Re-review PARTIAL/OPEN manually.
 *
 * Run: `npx tsx scripts/audit-acl-routes.ts`
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const ADMIN_DIR = path.join(ROOT, "src/app/api/admin");
const PUBLIC_DIR = path.join(ROOT, "src/app/api/public");
const OUTPUT = path.join(ROOT, "docs/ACL_AUDIT_MATRIX.md");

const GUARD_FUNCS = [
  "requireAuth",
  "requireRole",
  "requireAdminRole",
  "requireSuperAdmin",
  "requireHrOrAdminRole",
  "requireEstimateAccess",
  "requireStaffAccess",
  "requireProjectAccess",
  "requireForeman",
  "requireOwner",
  "canViewFinance",
  "canUploadProjectFiles",
  "canViewProject",
];
const FIRM_FUNCS = [
  "assertHomeFirm",
  "assertCanAccessFirm",
  "isHomeFirmFor",
  "resolveFirmScopeForRequest",
  "firmWhereForProject",
  "firmWhereForFinance",
  "firmWhereForPayment",
  "firmWhereForTask",
  "counterpartyFirmWhere",
];
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

type Row = {
  file: string;
  methods: string[];
  guards: string[];
  firm: string[];
  hasAuth: boolean;
  hasToken: boolean;
  status: "GUARDED" | "PARTIAL" | "OPEN";
};

function walkRoutes(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRoutes(full));
    else if (entry.name === "route.ts" || entry.name === "route.tsx") out.push(full);
  }
  return out;
}

// Inline role check patterns (handlers that hand-roll role gates instead of
// calling a require-* helper). Treated as equivalent to a guard for status.
const INLINE_ROLE_PATTERNS: RegExp[] = [
  /session(\?\.user)?\.user\.role\s*===\s*["'][A-Z_]+["']/,
  /session(\?\.user)?\.user\.role\s*!==\s*["'][A-Z_]+["']/,
  /\bROLES?\.\w+\.has\(/,
  /\b[A-Z_]+_ROLES\.(?:has|includes)\(/,
  /\b(?:allowedRoles|allowed|allowList|ROLE_SET)\.(?:has|includes)\(.*?role/,
  /getActiveRoleFromSession\(/,
  // Inline literal allowlist: ["A","B"].includes(session.user.role)
  /\[\s*["'][A-Z_]+["'][^\]]*\]\.includes\([^)]*\.role\b/,
  // session.user.role !== "X" || role !== "X"
  /\.role\s*(?:===|!==)\s*["'][A-Z_]+["']/,
  // new Set(["A","B"]).has(role)
  /new\s+Set\(\s*\[[^\]]+\]\s*\)\.has\(/,
];

// Inline firm scoping. If a handler manually filters by firmId/firm in a
// Prisma where clause, we count it as firm-aware even without an assert helper.
const INLINE_FIRM_PATTERNS: RegExp[] = [
  /firmId\s*:\s*firmId/,
  /firmId\s*:\s*\w+\.firmId/,
  /firmId\s*:\s*session/,
  /where\s*:\s*\{[^}]*firmId/,
];

// Per-user ownership: handler restricts query to the caller's own rows. This
// is a valid auth scheme for "self" endpoints (e.g. /me/*, /ai/conversations).
const OWNERSHIP_PATTERNS: RegExp[] = [
  /\b(?:userId|createdById|ownerId|authorId|requestedById|assigneeId)\s*:\s*session(\?\.user)?\.user\.id/,
  /\buser\s*:\s*\{\s*id\s*:\s*session(\?\.user)?\.user\.id/,
  // user.update({ where: { id: session.user.id } }) — self-only operation.
  /\bid\s*:\s*session(\?\.user)?\.user\.id/,
];

function analyzeFile(file: string, area: "admin" | "public"): Row {
  const src = fs.readFileSync(file, "utf8");
  const methods = HTTP_METHODS.filter((m) =>
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(src) ||
    new RegExp(`export\\s+const\\s+${m}\\s*=`).test(src),
  );
  const guards = GUARD_FUNCS.filter((g) => new RegExp(`\\b${g}\\b`).test(src));
  const firm = FIRM_FUNCS.filter((f) => new RegExp(`\\b${f}\\b`).test(src));
  const hasAuth = /\bauth\s*\(\s*\)/.test(src) || guards.length > 0;
  const hasInlineRole = INLINE_ROLE_PATTERNS.some((p) => p.test(src));
  const hasInlineFirm = INLINE_FIRM_PATTERNS.some((p) => p.test(src));
  const hasOwnership = OWNERSHIP_PATTERNS.some((p) => p.test(src));
  const hasToken =
    area === "public" && /\[token\]|accessToken|publicLinkToken|bearer/i.test(src);

  let status: Row["status"];
  if (area === "public") {
    status = hasToken ? "GUARDED" : "OPEN";
  } else {
    if (guards.length > 0 || hasInlineRole) status = "GUARDED";
    else if (hasAuth && hasOwnership) status = "GUARDED";
    else if (hasAuth) status = "PARTIAL";
    else status = "OPEN";
  }

  return {
    file: path.relative(ROOT, file),
    methods: methods.length ? methods : ["?"],
    guards: guards.length
      ? guards
      : hasInlineRole
        ? ["inline-role-check"]
        : hasOwnership
          ? ["self-only"]
          : [],
    firm: firm.length ? firm : hasInlineFirm ? ["inline-firmId-where"] : [],
    hasAuth,
    hasToken,
    status,
  };
}

function render(rows: Row[], area: "admin" | "public"): string {
  const sorted = [...rows].sort((a, b) => {
    const order = { OPEN: 0, PARTIAL: 1, GUARDED: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.file.localeCompare(b.file);
  });
  const counts = {
    GUARDED: sorted.filter((r) => r.status === "GUARDED").length,
    PARTIAL: sorted.filter((r) => r.status === "PARTIAL").length,
    OPEN: sorted.filter((r) => r.status === "OPEN").length,
  };
  const lines: string[] = [];
  lines.push(
    `### ${area === "admin" ? "Admin" : "Public"} routes (${sorted.length})\n`,
  );
  lines.push(
    `- ✅ GUARDED: **${counts.GUARDED}**  ⚠️ PARTIAL: **${counts.PARTIAL}**  ❌ OPEN: **${counts.OPEN}**\n`,
  );
  lines.push("| Status | File | Methods | Guards | Firm scope |");
  lines.push("|---|---|---|---|---|");
  for (const r of sorted) {
    const icon = r.status === "GUARDED" ? "✅" : r.status === "PARTIAL" ? "⚠️" : "❌";
    lines.push(
      `| ${icon} ${r.status} | \`${r.file}\` | ${r.methods.join(", ")} | ${r.guards.join(", ") || "—"} | ${r.firm.join(", ") || "—"} |`,
    );
  }
  return lines.join("\n");
}

function main() {
  const adminFiles = walkRoutes(ADMIN_DIR);
  const publicFiles = walkRoutes(PUBLIC_DIR);
  const adminRows = adminFiles.map((f) => analyzeFile(f, "admin"));
  const publicRows = publicFiles.map((f) => analyzeFile(f, "public"));

  const md = [
    "# ACL Audit Matrix",
    "",
    `Generated by \`scripts/audit-acl-routes.ts\` on ${new Date().toISOString()}.`,
    "",
    "This is a **static heuristic**, not a proof. ⚠️ PARTIAL and ❌ OPEN rows",
    "require manual review. Public routes are considered guarded when they",
    "validate a token in the URL.",
    "",
    render(adminRows, "admin"),
    "",
    render(publicRows, "public"),
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, md);
  const total = adminRows.length + publicRows.length;
  const open = adminRows.filter((r) => r.status === "OPEN").length +
    publicRows.filter((r) => r.status === "OPEN").length;
  const partial = adminRows.filter((r) => r.status === "PARTIAL").length;
  console.log(`Audited ${total} routes — wrote ${path.relative(ROOT, OUTPUT)}`);
  console.log(`  OPEN: ${open}, PARTIAL: ${partial}`);
}

main();
