import { prisma } from "@/lib/prisma";

/**
 * Writes one Audit Log entry. Call this from a route right after the write
 * it's tracing succeeds — never blocks the response on failure, since a
 * broken log write shouldn't take down the underlying action.
 *
 * Pass `actorId` whenever a signed-in account did the thing: actorName is
 * just a display name and two accounts can share one.
 */
export async function logAudit(entry: {
  action: string;
  entityType: string;
  entityId?: number;
  description: string;
  actorName: string;
  actorId?: number;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        ...entry,
        // Keep an absurd typed-in username (failed logins) from bloating the table.
        description: entry.description.slice(0, 500),
        actorName: entry.actorName.slice(0, 120),
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
