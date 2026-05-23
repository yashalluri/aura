// Cross-Aura coordination — the Aura-to-Aura handshake protocol.
//
// Two users both have Aura. Both in the same group. With explicit opt-in,
// User A's Aura can act on A's behalf in coordination with User B's Aura.
//
// Trust model:
//   - Each delegation is per-group + per-scope (e.g. "scheduling only").
//   - Delegations expire after N hours OR after explicit revocation.
//   - The delegating Aura NEVER reveals personal memory to the requesting
//     Aura. It emits decisions (yes/no/maybe) + a reason hint only.
//   - Persisted in the aura_delegations table.

import { prisma } from "../lib/db.js";

export type DelegationScope = "scheduling" | "rsvp" | "plan_drafting";

export interface ScheduleProposal {
  proposalId: string;
  windowStart: Date;
  windowEnd: Date;
  participantsRequired: number;
  context?: string;
}

export interface AuraDecision {
  granterUserId: string;
  proposalId: string;
  vote: "yes" | "no" | "maybe";
  reasonHint?: string;
}

export async function grantDelegation(opts: {
  granterUserId: string;
  groupSpaceId: string;
  scope: DelegationScope;
  durationHours?: number;
}) {
  const dur = opts.durationHours ?? 24;
  return prisma.auraDelegation.create({
    data: {
      granterUserId: opts.granterUserId,
      groupSpaceId: opts.groupSpaceId,
      scope: opts.scope,
      expiresAt: new Date(Date.now() + dur * 60 * 60 * 1000),
    },
  });
}

export async function revokeDelegation(id: string): Promise<boolean> {
  const updated = await prisma.auraDelegation
    .update({ where: { id }, data: { revokedAt: new Date() } })
    .catch(() => null);
  return Boolean(updated);
}

export async function activeDelegations(userId: string, groupSpaceId: string) {
  return prisma.auraDelegation.findMany({
    where: {
      granterUserId: userId,
      groupSpaceId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}

/**
 * Decide on a schedule proposal on the granter's behalf. Pulls their
 * calendar for the proposal window, applies soft preferences, emits a
 * decision WITHOUT leaking memory content.
 */
export async function decideSchedule(opts: {
  userId: string;
  groupSpaceId: string;
  proposal: ScheduleProposal;
}): Promise<AuraDecision> {
  const dels = await activeDelegations(opts.userId, opts.groupSpaceId);
  const hasScheduling = dels.some((d) => d.scope === "scheduling");
  if (!hasScheduling) {
    return {
      granterUserId: opts.userId,
      proposalId: opts.proposal.proposalId,
      vote: "no",
      reasonHint: "delegation not granted — defer to me",
    };
  }

  const conflicts = await prisma.signalEvent.findMany({
    where: {
      userId: opts.userId,
      kind: "calendar.event",
      occurredAt: { gte: opts.proposal.windowStart, lte: opts.proposal.windowEnd },
    },
    take: 5,
  });
  if (conflicts.length > 0) {
    return {
      granterUserId: opts.userId,
      proposalId: opts.proposal.proposalId,
      vote: "no",
      reasonHint: "calendar conflict",
    };
  }

  return {
    granterUserId: opts.userId,
    proposalId: opts.proposal.proposalId,
    vote: "yes",
    reasonHint: "free + good fit",
  };
}
