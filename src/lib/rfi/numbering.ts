import type { Prisma } from "@prisma/client";

/// Atomic RFI numbering per project. MUST be called inside a transaction —
/// the row-level lock on the bumped project row guarantees uniqueness even
/// under concurrent POSTs.
///
/// Returns the new number, e.g. "RFI-001". Throws on Prisma errors.
export async function nextRFINumber(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<string> {
  const project = await tx.project.update({
    where: { id: projectId },
    data: { rfiCounter: { increment: 1 } },
    select: { rfiCounter: true },
  });
  return `RFI-${String(project.rfiCounter).padStart(3, "0")}`;
}
