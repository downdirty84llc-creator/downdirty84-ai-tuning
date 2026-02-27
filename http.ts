import type { Response } from "express";

export function badRequest(res: Response, message: string, details?: Record<string, unknown>) {
  return res.status(400).json({ error: "BAD_REQUEST", message, details: details ?? {} });
}

export function notFound(res: Response, message: string) {
  return res.status(404).json({ error: "NOT_FOUND", message });
}
