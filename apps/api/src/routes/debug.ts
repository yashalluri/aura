import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";
import { runDailyCheckinForUser } from "../scheduler/runForUser.js";

const QuerySchema = z.object({
  phone: z.string().min(1),
  persist: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export async function debugRoutes(app: FastifyInstance): Promise<void> {
  app.get("/debug/daily-checkin", async (req) => {
    const { phone, persist } = QuerySchema.parse(req.query);
    const user = await prisma.user.findUnique({
      where: { phoneNumber: phone },
    });
    if (!user) throw notFound("User");
    return runDailyCheckinForUser(user, { persist });
  });
}
