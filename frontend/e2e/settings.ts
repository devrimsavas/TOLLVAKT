// Ports and fixed values shared by the Playwright config and the tests.
// They match backend/tests/e2e.

export const API_PORT = 3100;
export const WEB_PORT = 3101;
// The control server in backend/tests/e2e/fakeServices.mjs
export const CONTROL_PORT = 3199;

export const API_URL = `http://localhost:${API_PORT}`;
export const CONTROL_URL = `http://localhost:${CONTROL_PORT}`;

// Created by the API on startup from backend/tests/e2e/e2e.env
export const ADMIN = {
  email: "admin@e2e.example.com",
  password: "AdminE2eSecure2026",
};

// USER_DAILY_LIMIT in backend/tests/e2e/e2e.env
export const USER_DAILY_LIMIT = 3;
