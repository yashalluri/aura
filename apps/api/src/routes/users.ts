import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TONE_MODES } from "@aura/shared";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";

const CreateUserSchema = z.object({
  phoneNumber: z.string().min(5),
  timezone: z.string().default("UTC"),
  checkInHour: z.number().int().min(0).max(23).default(8),
  toneMode: z.enum(TONE_MODES as unknown as [string, ...string[]]).default("neutral"),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().optional(),
  checkInHour: z.number().int().min(0).max(23).optional(),
  toneMode: z.enum(TONE_MODES as unknown as [string, ...string[]]).optional(),
  isOnboarded: z.boolean().optional(),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.post("/users", async (req, reply) => {
    const body = CreateUserSchema.parse(req.body);
    const user = await prisma.user.upsert({
      where: { phoneNumber: body.phoneNumber },
      create: {
        phoneNumber: body.phoneNumber,
        timezone: body.timezone,
        checkInHour: body.checkInHour,
        toneMode: body.toneMode as "neutral" | "millennial" | "gen_z",
      },
      update: {},
    });
    return reply.code(201).send(user);
  });

  app.get<{ Params: { phone: string } }>(
    "/users/by-phone/:phone",
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { phoneNumber: req.params.phone },
      });
      if (!user) throw notFound("User");
      return user;
    },
  );

  app.get<{ Params: { userId: string } }>("/users/:userId", async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
    });
    if (!user) throw notFound("User");
    return user;
  });

  app.patch<{ Params: { userId: string } }>(
    "/users/:userId",
    async (req) => {
      const body = UpdateUserSchema.parse(req.body);
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.timezone !== undefined) data.timezone = body.timezone;
      if (body.checkInHour !== undefined) data.checkInHour = body.checkInHour;
      if (body.toneMode !== undefined) data.toneMode = body.toneMode;
      if (body.isOnboarded !== undefined) data.isOnboarded = body.isOnboarded;
      const user = await prisma.user
        .update({ where: { id: req.params.userId }, data })
        .catch(() => null);
      if (!user) throw notFound("User");
      return user;
    },
  );
}
