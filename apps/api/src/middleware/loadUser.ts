import type { FastifyRequest } from "fastify";
import type { User } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { notFound } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: User;
  }
}

export async function loadUserFromParam(
  req: FastifyRequest<{ Params: { userId: string } }>,
): Promise<User> {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User");
  req.currentUser = user;
  return user;
}
