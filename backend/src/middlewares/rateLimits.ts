// Limits on how often the same client may call the API, against abuse.
// Counts are kept in memory, so they are per API process and start again
// when it restarts. The client's IP address is req.ip; see TRUST_PROXY in
// app.ts for how it is read behind a proxy.
//
// Each limit is read from the environment on every request, so it can be
// changed without code and the tests can set their own.
import type { Request, Response } from "express";
import {
  rateLimit,
  type Options,
  type RateLimitInfo,
} from "express-rate-limit";
import { normalizeEmail } from "../services/authService.js";

const MINUTE = 60 * 1000;

export function envLimit(name: string, fallback: number): () => number {
  return () => {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
}

// The 429 answer says when the client may try again
export function tooMany(message: string): Options["handler"] {
  return (req: Request & { rateLimit?: RateLimitInfo }, res: Response) => {
    const resetTime = req.rateLimit?.resetTime?.getTime() ?? Date.now();
    res.status(429).json({
      error: message,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((resetTime - Date.now()) / 1000),
      ),
    });
  };
}

export const common = {
  // RateLimit and RateLimit-Policy headers (IETF draft 8) and Retry-After
  standardHeaders: "draft-8",
  legacyHeaders: false,
} as const;

// Wrong passwords for one account, from any address: stops guessing one
// user's password even when the attacker changes IP address
export const loginPerAccountLimit = rateLimit({
  ...common,
  windowMs: 15 * MINUTE,
  limit: envLimit("LOGIN_FAILURES_PER_ACCOUNT", 10),
  // Successful logins do not count
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email: unknown = req.body?.email;
    return `account:${typeof email === "string" ? normalizeEmail(email) : ""}`;
  },
  identifier: "login-account",
  handler: tooMany("Too many failed login attempts. Try again later."),
});

// Wrong passwords from one address, for any accounts: stops trying a list
// of leaked passwords against many accounts
export const loginPerAddressLimit = rateLimit({
  ...common,
  windowMs: 15 * MINUTE,
  limit: envLimit("LOGIN_FAILURES_PER_ADDRESS", 30),
  skipSuccessfulRequests: true,
  identifier: "login-address",
  handler: tooMany("Too many failed login attempts. Try again later."),
});

// New accounts from one address
export const registerLimit = rateLimit({
  ...common,
  windowMs: 60 * MINUTE,
  limit: envLimit("REGISTRATIONS_PER_ADDRESS", 10),
  identifier: "register",
  handler: tooMany("Too many new accounts from this address. Try again later."),
});

// All API requests from one address
export const apiLimit = rateLimit({
  ...common,
  windowMs: 15 * MINUTE,
  limit: envLimit("REQUESTS_PER_ADDRESS", 1500),
  identifier: "api",
  handler: tooMany("Too many requests. Try again later."),
});
