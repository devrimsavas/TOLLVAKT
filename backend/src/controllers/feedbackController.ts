import type { Request, Response } from "express";
import { toEmailLanguage } from "../services/email/templates.js";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  FeedbackNotSetUpError,
  sendFeedback,
} from "../services/feedbackService.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PAGE_LENGTH = 200;

// POST /api/feedback
export const postFeedback = async (req: Request, res: Response) => {
  // #swagger.tags = ["Feedback"]
  /* #swagger.description = "Sends feedback to the owner of Tollvakt by email; nothing is stored. email is optional: without it the feedback is anonymous. kind is idea, problem or other. website must be empty (a trap for robots)."
     #swagger.requestBody = {
       required: true,
       content: { "application/json": { example: { kind: "idea", message: "It would help to see the chapter notes.", email: "kari@example.com", language: "nb", page: "/classify" } } }
     } */
  const { kind, message, email, language, page, website } = req.body ?? {};

  // Robots fill every field; people never see this one. They get the same
  // answer as everyone, so they do not learn they were caught.
  if (typeof website === "string" && website.trim() !== "") {
    res.status(202).json({ message: "Thank you for the feedback" });
    return;
  }

  const text = typeof message === "string" ? message.trim() : "";
  if (text.length < FEEDBACK_MIN_LENGTH || text.length > FEEDBACK_MAX_LENGTH) {
    res.status(400).json({
      error: `The message must be ${FEEDBACK_MIN_LENGTH} to ${FEEDBACK_MAX_LENGTH} characters`,
    });
    return;
  }

  const address = typeof email === "string" ? email.trim() : "";
  if (address && (address.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(address))) {
    res.status(400).json({ error: "The email address is not valid" });
    return;
  }

  if (kind !== undefined && !FEEDBACK_KINDS.includes(kind)) {
    res.status(400).json({ error: `kind must be one of ${FEEDBACK_KINDS.join(", ")}` });
    return;
  }

  const from = typeof page === "string" && page.startsWith("/") ? page.slice(0, MAX_PAGE_LENGTH) : null;

  try {
    await sendFeedback({
      kind: kind ?? "other",
      message: text,
      email: address || null,
      language: toEmailLanguage(language),
      page: from,
    });
    res.status(202).json({ message: "Thank you for the feedback" });
  } catch (error) {
    if (error instanceof FeedbackNotSetUpError) {
      req.log.error({ err: error }, "Feedback is not set up");
      res.status(503).json({ error: "Feedback is not set up on this server" });
      return;
    }
    // The user is told, so the message is not lost without them knowing
    req.log.error({ err: error }, "Feedback email failed");
    res.status(502).json({ error: "The feedback could not be sent. Try again later." });
  }
};
