import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { scheduleNudge, listScheduledFor, cancelNudge } from "../services/nudges.js";

const NudgeSchema = z.object({
  when: z.coerce.date(),
  kind: z.enum(["reminder", "goal_check", "contact_nudge", "routine_nudge", "callback"]),
  payload: z.record(z.unknown()).optional(),
});

export async function nudgeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { userId: string } }>(
    "/users/:userId/nudges",
    async (req) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      return listScheduledFor(user.id, { limit: 50 });
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/users/:userId/nudges",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");
      const body = NudgeSchema.parse(req.body);
      const nudge = await scheduleNudge({ userId: user.id, ...body });
      return reply.code(201).send(nudge);
    },
  );

  app.delete<{ Params: { userId: string; nudgeId: string } }>(
    "/users/:userId/nudges/:nudgeId",
    async (req) => {
      const n = await prisma.nudgeSchedule.findUnique({ where: { id: req.params.nudgeId } });
      if (!n || n.userId !== req.params.userId) throw notFound("Nudge");
      return cancelNudge(n.id);
    },
  );
}
