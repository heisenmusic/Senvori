"use client";

import { createAuthClient } from "better-auth/react";
import { API_URL } from "./config";

/**
 * Better Auth browser client (P8). Talks to the API's /v1/auth mount with
 * cookie credentials. `signIn`, `signOut`, `useSession` back the login flow,
 * logout and protected-route session checks.
 */
export const authClient = createAuthClient({
  baseURL: `${API_URL}/v1/auth`,
});
