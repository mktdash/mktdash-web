import { afterEach, describe, expect, it, vi } from "vitest";

const loadEnv = async (overrides: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value);
  }

  vi.resetModules();

  return { env: (await import("./env")).env };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env", () => {
  it("falls back to defaults so a fresh clone boots with no .env file", async () => {
    const { env } = await loadEnv({
      CI: undefined,
      PLAYWRIGHT_BASE_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
    });

    expect(env.CI).toBe(false);
    expect(env.PLAYWRIGHT_BASE_URL).toBe("http://localhost:3000");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("treats an empty assignment as unset rather than as an empty string", async () => {
    const { env } = await loadEnv({ NEXT_PUBLIC_APP_URL: "" });

    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("parses CI as a boolean, so CI=false disables CI behaviour", async () => {
    await expect(loadEnv({ CI: "false" })).resolves.toMatchObject({
      env: { CI: false },
    });
    await expect(loadEnv({ CI: "true" })).resolves.toMatchObject({
      env: { CI: true },
    });
  });

  it("rejects a malformed URL instead of shipping it", async () => {
    await expect(loadEnv({ NEXT_PUBLIC_APP_URL: "notaurl" })).rejects.toThrow(
      /Invalid environment variables[\s\S]*NEXT_PUBLIC_APP_URL/,
    );
  });

  it("rejects an unknown NODE_ENV", async () => {
    await expect(loadEnv({ NODE_ENV: "staging" })).rejects.toThrow(
      /Invalid environment variables[\s\S]*NODE_ENV/,
    );
  });

  it("points the BFF at the local gateway when no upstream is configured", async () => {
    const { env } = await loadEnv({ API_GATEWAY_URL: undefined });

    expect(env.API_GATEWAY_URL).toBe("http://127.0.0.1:8080");
  });

  it("refuses to boot without a session secret rather than inventing one", async () => {
    await expect(loadEnv({ SESSION_SECRET: undefined })).rejects.toThrow(
      /Invalid environment variables[\s\S]*SESSION_SECRET/,
    );
  });

  it("rejects a session secret that is not a 32-byte key", async () => {
    await expect(loadEnv({ SESSION_SECRET: "too-short" })).rejects.toThrow(
      /Invalid environment variables[\s\S]*SESSION_SECRET/,
    );
  });

  it("accepts a 32-byte key in either base64 or base64url form", async () => {
    await expect(
      loadEnv({
        SESSION_SECRET: "ZIFsFmMRAdAOAN8d2LExJGDErC/LczJQWU+HBAeYE9A=",
      }),
    ).resolves.toMatchObject({ env: { SESSION_SECRET: expect.any(String) } });

    await expect(
      loadEnv({
        SESSION_SECRET: "ZIFsFmMRAdAOAN8d2LExJGDErC_LczJQWU-HBAeYE9A",
      }),
    ).resolves.toMatchObject({ env: { SESSION_SECRET: expect.any(String) } });
  });
});
