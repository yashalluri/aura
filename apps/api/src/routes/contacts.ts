import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RELATIONSHIP_TYPES } from "@aura/shared";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";

const relationshipEnum = z.enum(
  RELATIONSHIP_TYPES as unknown as [string, ...string[]],
);

const CreateContactSchema = z.object({
  name: z.string().min(1),
  relationshipType: relationshipEnum.default("friend"),
  targetFrequencyDays: z.number().int().positive(),
  birthday: z.coerce.date().optional(),
});

const UpdateContactSchema = z.object({
  name: z.string().min(1).optional(),
  relationshipType: relationshipEnum.optional(),
  targetFrequencyDays: z.number().int().positive().optional(),
  birthday: z.coerce.date().nullable().optional(),
  lastCheckInAt: z.coerce.date().nullable().optional(),
});

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { userId: string } }>(
    "/users/:userId/contacts",
    async (req) => {
      return prisma.contact.findMany({
        where: { userId: req.params.userId },
        orderBy: { createdAt: "asc" },
      });
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/users/:userId/contacts",
    async (req, reply) => {
      const body = CreateContactSchema.parse(req.body);
      const userExists = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true },
      });
      if (!userExists) throw notFound("User");
      const contact = await prisma.contact.create({
        data: {
          userId: req.params.userId,
          name: body.name,
          relationshipType: body.relationshipType as
            | "inner_circle"
            | "friend"
            | "acquaintance"
            | "other",
          targetFrequencyDays: body.targetFrequencyDays,
          birthday: body.birthday ?? null,
        },
      });
      return reply.code(201).send(contact);
    },
  );

  app.patch<{ Params: { id: string } }>("/contacts/:id", async (req) => {
    const body = UpdateContactSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.relationshipType !== undefined)
      data.relationshipType = body.relationshipType;
    if (body.targetFrequencyDays !== undefined)
      data.targetFrequencyDays = body.targetFrequencyDays;
    if (body.birthday !== undefined) data.birthday = body.birthday;
    if (body.lastCheckInAt !== undefined)
      data.lastCheckInAt = body.lastCheckInAt;
    const updated = await prisma.contact
      .update({ where: { id: req.params.id }, data })
      .catch(() => null);
    if (!updated) throw notFound("Contact");
    return updated;
  });

  app.delete<{ Params: { id: string } }>(
    "/contacts/:id",
    async (req, reply) => {
      const deleted = await prisma.contact
        .delete({ where: { id: req.params.id } })
        .catch(() => null);
      if (!deleted) throw notFound("Contact");
      return reply.code(204).send();
    },
  );
}
