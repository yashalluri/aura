import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import {
  createGoal,
  listGoals,
  updateGoalStatus,
  completeMilestone,
  getGoal,
  staleGoals,
} from "../services/goals.js";

const CreateSchema = z.object({
  kind: z.enum(["short", "long"]),
  title: z.string().min(1).max(200),
  why: z.string().max(2000).optional(),
  deadline: z.coerce.date().optional(),
  parentId: z.string().optional(),
  milestones: z.array(z.object({ title: z.string().min(1).max(200) })).optional(),
});

const StatusSchema = z.object({
  status: z.enum(["active", "done", "paused", "abandoned"]),
});

export async function goalRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { userId: string }; Querystring: { status?: string; kind?: string } }>(
    "/users/:userId/goals",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const status = req.query.status as "active" | "done" | "paused" | "abandoned" | undefined;
      const kind = req.query.kind as "short" | "long" | undefined;
      return listGoals(user.id, { status, kind });
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/users/:userId/goals",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const body = CreateSchema.parse(req.body);
      const goal = await createGoal({ userId: user.id, ...body });
      return reply.code(201).send(goal);
    },
  );

  app.get<{ Params: { userId: string; goalId: string } }>(
    "/users/:userId/goals/:goalId",
    async (req) => {
      const goal = await getGoal(req.params.goalId);
      if (!goal || goal.userId !== req.params.userId) throw notFound("Goal");
      return goal;
    },
  );

  app.patch<{ Params: { userId: string; goalId: string } }>(
    "/users/:userId/goals/:goalId/status",
    async (req) => {
      const goal = await getGoal(req.params.goalId);
      if (!goal || goal.userId !== req.params.userId) throw notFound("Goal");
      const { status } = StatusSchema.parse(req.body);
      return updateGoalStatus(goal.id, status);
    },
  );

  app.post<{ Params: { userId: string; milestoneId: string } }>(
    "/users/:userId/milestones/:milestoneId/complete",
    async (req) => {
      const body = z.object({ evidence: z.record(z.unknown()).optional() }).parse(req.body);
      const m = await prisma.milestone.findUnique({
        where: { id: req.params.milestoneId },
        include: { goal: true },
      });
      if (!m || m.goal.userId !== req.params.userId) throw notFound("Milestone");
      return completeMilestone(m.id, body.evidence);
    },
  );

  app.get<{ Params: { userId: string }; Querystring: { sinceDays?: string } }>(
    "/users/:userId/goals/stale",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const sinceDays = parseInt(req.query.sinceDays ?? "14", 10);
      return staleGoals(user.id, sinceDays);
    },
  );
}
