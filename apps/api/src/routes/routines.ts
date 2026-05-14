import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FREQUENCY_TYPES } from "@aura/shared";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";

const frequencyEnum = z.enum(
  FREQUENCY_TYPES as unknown as [string, ...string[]],
);

const CreateRoutineSchema = z.object({
  name: z.string().min(1),
  frequencyType: frequencyEnum,
  frequencyValue: z.number().int().positive(),
});

const UpdateRoutineSchema = z.object({
  name: z.string().min(1).optional(),
  frequencyType: frequencyEnum.optional(),
  frequencyValue: z.number().int().positive().optional(),
  lastDoneAt: z.coerce.date().nullable().optional(),
});

export async function routineRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { userId: string } }>(
    "/users/:userId/routines",
    async (req) => {
      return prisma.routine.findMany({
        where: { userId: req.params.userId },
        orderBy: { createdAt: "asc" },
      });
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/users/:userId/routines",
    async (req, reply) => {
      const body = CreateRoutineSchema.parse(req.body);
      const userExists = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true },
      });
      if (!userExists) throw notFound("User");
      const routine = await prisma.routine.create({
        data: {
          userId: req.params.userId,
          name: body.name,
          frequencyType: body.frequencyType as "daily" | "weekly" | "custom",
          frequencyValue: body.frequencyValue,
        },
      });
      return reply.code(201).send(routine);
    },
  );

  app.patch<{ Params: { id: string } }>("/routines/:id", async (req) => {
    const body = UpdateRoutineSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.frequencyType !== undefined) data.frequencyType = body.frequencyType;
    if (body.frequencyValue !== undefined)
      data.frequencyValue = body.frequencyValue;
    if (body.lastDoneAt !== undefined) data.lastDoneAt = body.lastDoneAt;
    const updated = await prisma.routine
      .update({ where: { id: req.params.id }, data })
      .catch(() => null);
    if (!updated) throw notFound("Routine");
    return updated;
  });

  app.delete<{ Params: { id: string } }>(
    "/routines/:id",
    async (req, reply) => {
      const deleted = await prisma.routine
        .delete({ where: { id: req.params.id } })
        .catch(() => null);
      if (!deleted) throw notFound("Routine");
      return reply.code(204).send();
    },
  );
}
