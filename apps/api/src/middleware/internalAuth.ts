import type { FastifyRequest } from "fastify";
import { env } from "../env.js";
import { unauthorized } from "../lib/errors.js";

export async function requireInternalAuth(req: FastifyRequest): Promise<void> {
  const header = req.headers.authorization;
  const expected = `Bearer ${env.INTERNAL_API_SECRET}`;
  if (!header || header !== expected) {
    throw unauthorized("Missing or invalid internal auth");
  }
}
