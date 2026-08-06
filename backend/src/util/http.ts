import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express 4 does not catch rejections from async handlers: one becomes an
 * unhandled rejection, which terminates the process under Node's default
 * policy. A single database hiccup would take the whole API down. Wrap every
 * async handler so the rejection reaches the error middleware instead.
 */
export function wrap(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function badRequest(res: Response, message: string, details?: Record<string, unknown>) {
  return res.status(400).json({ error: "BAD_REQUEST", message, details: details ?? {} });
}

export function notFound(res: Response, message: string) {
  return res.status(404).json({ error: "NOT_FOUND", message });
}

export function conflict(res: Response, message: string, details?: Record<string, unknown>) {
  return res.status(409).json({ error: "CONFLICT", message, details: details ?? {} });
}

/** Used when a request is well-formed but a required gate has not been passed. */
export function forbidden(res: Response, message: string, details?: Record<string, unknown>) {
  return res.status(403).json({ error: "FORBIDDEN", message, details: details ?? {} });
}
