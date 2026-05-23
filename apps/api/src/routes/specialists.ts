// Specialist dispatch route — the conversation worker calls this when the
// LLM emits a spawn_agent action.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import {
  dispatchSpecialist,
  isSpecialistKind,
  SPECIALISTS,
} from "../services/specialists.js";

const DispatchSchema = z.object({
  kind: z.string().refine(isSpecialistKind, { message: "unknown specialist kind" }),
  brief: z.object({
    goal: z.string().min(1).max(2000),
    context: z.string().max(4000).optional(),
    deadline: z.string().optional(),
    constraints: z.array(z.string()).optional(),
  }),
  triggerMessageId: z.string().optional(),
});

export async function specialistRoutes(app: FastifyInstance): Promise<void> {
  app.get("/specialists", async () => {
    return SPECIALISTS;
  });

  app.post<{ Params: { userId: string } }>(
    "/users/:userId/specialists/dispatch",
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) throw notFound("User");

      const body = DispatchSchema.parse(req.body);
      const result = await dispatchSpecialist({
        userId: user.id,
        kind: body.kind as Parameters<typeof dispatchSpecialist>[0]["kind"],
        brief: body.brief,
        triggerMessageId: body.triggerMessageId,
      });

      const meta = SPECIALISTS.find((s) => s.kind === body.kind);
      return reply.code(202).send({
        eventId: result.eventId,
        estimateMs: meta?.estimateMs ?? 5000,
      });
    },
  );
}
