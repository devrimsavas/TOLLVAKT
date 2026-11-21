import type { NextFunction, Request, Response } from "express";

// API paths that no route matched get a JSON 404 instead of Express's
// HTML page.
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

// The last stop for errors no route handled: a body that is not valid JSON
// gets its 400, anything else is logged and answered with a JSON 500
// instead of Express's HTML error page.
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
      ? error.status
      : 500;
  if (status === 500) {
    req.log.error({ err: error }, "Unhandled error");
    res.status(500).json({ error: "Something went wrong" });
    return;
  }
  res.status(status).json({
    error: status === 400 ? "The request body is not valid" : "Bad request",
  });
}
