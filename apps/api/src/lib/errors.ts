import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what: string) =>
  new HttpError(404, `${what} not found`);

export const badRequest = (msg: string, details?: unknown) =>
  new HttpError(400, msg, details);

export const unauthorized = (msg = "Unauthorized") =>
  new HttpError(401, msg);

export function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof HttpError) {
    return reply
      .code(err.statusCode)
      .send({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return reply
      .code(400)
      .send({ error: "Invalid request", details: err.flatten() });
  }
  const message = err instanceof Error ? err.message : "Internal Server Error";
  return reply.code(500).send({ error: message });
}
