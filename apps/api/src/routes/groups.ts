// Group chat routes — create groups, manage participants + memories.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";

const CreateGroupSchema = z.object({
  externalId: z.string().min(1),
  ownerId: z.string().min(1),
  name: z.string().optional(),
  vibe: z.string().optional(),
  responsePolicy: z.enum(["address_only", "implicit_call", "quiet", "host"]).default("address_only"),
});

const AddParticipantSchema = z.object({
  externalHandle: z.string().min(1),
  displayName: z.string().min(1),
  userId: z.string().optional(),
  role: z.enum(["owner", "member", "guest"]).default("member"),
});

const WriteGroupMemorySchema = z.object({
  kind: z.enum(["ritual", "inside_joke", "plan", "norm", "role", "recap"]),
  content: z.string().min(1).max(2000),
  importance: z.number().min(0).max(1).optional(),
});

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  // Create / upsert a group by externalId.
  app.post("/groups", async (req, reply) => {
    const body = CreateGroupSchema.parse(req.body);
    const group = await prisma.groupSpace.upsert({
      where: { externalId: body.externalId },
      create: body,
      update: {
        name: body.name,
        vibe: body.vibe,
        responsePolicy: body.responsePolicy,
      },
    });
    return reply.code(201).send(group);
  });

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId",
    async (req) => {
      const group = await prisma.groupSpace.findUnique({
        where: { id: req.params.groupId },
        include: { participants: true },
      });
      if (!group) throw notFound("GroupSpace");
      return group;
    },
  );

  app.get<{ Querystring: { externalId?: string } }>(
    "/groups/by-external",
    async (req) => {
      const externalId = req.query.externalId;
      if (!externalId) throw notFound("externalId required");
      const group = await prisma.groupSpace.findUnique({
        where: { externalId },
        include: { participants: true },
      });
      if (!group) throw notFound("GroupSpace");
      return group;
    },
  );

  app.patch<{ Params: { groupId: string } }>(
    "/groups/:groupId",
    async (req) => {
      const body = z
        .object({
          name: z.string().optional(),
          vibe: z.string().optional(),
          responsePolicy: z.enum(["address_only", "implicit_call", "quiet", "host"]).optional(),
        })
        .parse(req.body);
      const updated = await prisma.groupSpace.update({
        where: { id: req.params.groupId },
        data: body,
      });
      return updated;
    },
  );

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/participants",
    async (req, reply) => {
      const body = AddParticipantSchema.parse(req.body);
      const group = await prisma.groupSpace.findUnique({ where: { id: req.params.groupId } });
      if (!group) throw notFound("GroupSpace");
      const participant = await prisma.groupParticipant.upsert({
        where: {
          groupSpaceId_externalHandle: {
            groupSpaceId: group.id,
            externalHandle: body.externalHandle,
          },
        },
        create: { ...body, groupSpaceId: group.id },
        update: { displayName: body.displayName, role: body.role, userId: body.userId },
      });
      return reply.code(201).send(participant);
    },
  );

  app.patch<{ Params: { groupId: string; participantId: string } }>(
    "/groups/:groupId/participants/:participantId",
    async (req) => {
      const body = z
        .object({
          silenced: z.boolean().optional(),
          role: z.enum(["owner", "member", "guest"]).optional(),
        })
        .parse(req.body);
      const updated = await prisma.groupParticipant.update({
        where: { id: req.params.participantId },
        data: body,
      });
      return updated;
    },
  );

  app.get<{ Params: { groupId: string } }>(
    "/groups/:groupId/memories",
    async (req) => {
      const memories = await prisma.groupMemory.findMany({
        where: { groupSpaceId: req.params.groupId },
        orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
        take: 50,
      });
      return memories;
    },
  );

  app.post<{ Params: { groupId: string } }>(
    "/groups/:groupId/memories",
    async (req, reply) => {
      const body = WriteGroupMemorySchema.parse(req.body);
      const memory = await prisma.groupMemory.create({
        data: {
          groupSpaceId: req.params.groupId,
          kind: body.kind,
          content: body.content,
          importance: body.importance ?? 0.5,
        },
      });
      return reply.code(201).send(memory);
    },
  );
}
