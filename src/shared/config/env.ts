import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const LOCAL_ORIGIN = "http://localhost:3000";
const LOCAL_GATEWAY_ORIGIN = "http://127.0.0.1:8080";
const BASE64_32_BYTE_KEY = /^[A-Za-z0-9+/_-]{43}=?$/u;

export const env = createEnv({
  // Note: server only variables
  server: {
    CI: z.stringbool().default(false),
    PLAYWRIGHT_BASE_URL: z.url().default(LOCAL_ORIGIN),
    API_GATEWAY_URL: z.url().default(LOCAL_GATEWAY_ORIGIN),
    SESSION_SECRET: z
      .string()
      .regex(
        BASE64_32_BYTE_KEY,
        "must be a base64-encoded 32-byte key — generate one with `openssl rand -base64 32`",
      ),
  },

  // Note: browser-accessible variables
  client: {
    NEXT_PUBLIC_APP_URL: z.url().default(LOCAL_ORIGIN),
  },

  // Note: server + client variables
  shared: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  // Note: runtime mapping for relevant variables. Only client and shared
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  // Note: how empty values are interpreted
  emptyStringAsUndefined: true,

  // Note: what happens when validation fails
  onValidationError: (issues) => {
    const details = issues
      .map((issue) => {
        const [segment] = issue.path ?? [];
        const name =
          segment === undefined
            ? "(root)"
            : String(typeof segment === "object" ? segment.key : segment);

        return `  - ${name}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(
      `Invalid environment variables:\n${details}\n\nSee .env.example for the expected shape.`,
    );
  },

  // Note: what happens when access is attempted incorrectly
  onInvalidAccess: (variable) => {
    throw new Error(
      `Attempted to read the server-only environment variable "${variable}" from the client. Move the read to the server, or expose it deliberately as a NEXT_PUBLIC_ variable.`,
    );
  },
});
