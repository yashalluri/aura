import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";

const WaitlistSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
});

export async function waitlistRoutes(app: FastifyInstance): Promise<void> {
  app.post("/waitlist", async (req, reply) => {
    const { email } = WaitlistSchema.parse(req.body);
    const entry = await prisma.waitlist.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    return reply.code(201).send({ id: entry.id, email: entry.email });
  });
}
