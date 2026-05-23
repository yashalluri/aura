// Goal lifecycle service.
//
// Goals are extracted from conversation by the memory layer (kind=goal) and
// promoted to Goal rows when the user confirms. Background `goal_review`
// agent keeps them alive — without that, goals become to-do-list rot.

import { prisma } from "../lib/db.js";

export type GoalKind = "short" | "long";
export type GoalStatus = "active" | "done" | "paused" | "abandoned";

export interface CreateGoalInput {
  userId: string;
  kind: GoalKind;
  title: string;
  why?: string;
  deadline?: Date;
  parentId?: string;
  milestones?: Array<{ title: string }>;
}

export async function createGoal(input: CreateGoalInput) {
  const goal = await prisma.goal.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      why: input.why,
      deadline: input.deadline,
      parentId: input.parentId,
      milestones: input.milestones?.length
        ? { create: input.milestones.map((m) => ({ title: m.title })) }
        : undefined,
    },
    include: { milestones: true },
  });
  return goal;
}

export async function listGoals(userId: string, opts: { status?: GoalStatus; kind?: GoalKind } = {}) {
  return prisma.goal.findMany({
    where: { userId, status: opts.status, kind: opts.kind },
    include: { milestones: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function updateGoalStatus(goalId: string, status: GoalStatus) {
  return prisma.goal.update({ where: { id: goalId }, data: { status } });
}

export async function completeMilestone(milestoneId: string, evidence?: Record<string, unknown>) {
  return prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      doneAt: new Date(),
      evidence: (evidence ?? {}) as object,
    },
  });
}

export async function getGoal(goalId: string) {
  return prisma.goal.findUnique({
    where: { id: goalId },
    include: { milestones: true, children: true, parent: true },
  });
}

/**
 * Stale goals: active goals with no recent activity. Used by goal-review agent.
 */
export async function staleGoals(userId: string, sinceDays = 14) {
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  return prisma.goal.findMany({
    where: {
      userId,
      status: "active",
      updatedAt: { lt: cutoff },
    },
    include: { milestones: true },
    orderBy: { updatedAt: "asc" },
  });
}
