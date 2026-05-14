import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";

const ContactCheckinSchema = z.object({
  contactId: z.string().min(1),
});

const RoutineDoneSchema = z.object({
  routineId: z.string().min(1),
});

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.post("/events/contact-checkin", async (req) => {
    const { contactId } = ContactCheckinSchema.parse(req.body);
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) throw notFound("Contact");

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.contact.update({
        where: { id: contactId },
        data: { lastCheckInAt: now },
      }),
      prisma.eventLog.create({
        data: {
          userId: contact.userId,
          type: "contact_check_in_done",
          payload: { contactId, name: contact.name },
        },
      }),
    ]);
    return updated;
  });

  app.post("/events/routine-done", async (req) => {
    const { routineId } = RoutineDoneSchema.parse(req.body);
    const routine = await prisma.routine.findUnique({
      where: { id: routineId },
    });
    if (!routine) throw notFound("Routine");

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.routine.update({
        where: { id: routineId },
        data: { lastDoneAt: now },
      }),
      prisma.eventLog.create({
        data: {
          userId: routine.userId,
          type: "routine_done",
          payload: { routineId, name: routine.name },
        },
      }),
    ]);
    return updated;
  });
}
