import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  credentials: "include",
  plugins: [organizationClient()],
});

export type Session = typeof authClient.$Infer.Session;
