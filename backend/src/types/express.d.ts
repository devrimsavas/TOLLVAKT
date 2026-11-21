// Adds the authenticated user to Express requests.
// requireAuth (added with authentication) fills it in after verifying the token.
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: "user" | "admin";
      };
    }
  }
}

export {};
