import { describe, expect, it } from "vitest";
import {
  isCredentialRenewalRequired,
  isUpstreamUnavailable,
  parseProblemDetails,
  PROBLEM_CODES,
  type ProblemDetails,
} from "./problemDetails";

const problem = (over: Partial<ProblemDetails> = {}): unknown => ({
  type: "https://errors.mktdash.io/not-found",
  title: "Not found",
  status: 404,
  code: PROBLEM_CODES.notFound,
  detail: "No route at this address is served by the gateway.",
  instance: "/v1/auth/session",
  requestId: "01J0000000000000000000",
  ...over,
});

describe("parsing a well-formed problem document", () => {
  it("keeps every field the caller might need", () => {
    const parsed = parseProblemDetails(problem());

    expect(parsed).toMatchObject({
      type: "https://errors.mktdash.io/not-found",
      title: "Not found",
      status: 404,
      code: "not_found",
      instance: "/v1/auth/session",
      requestId: "01J0000000000000000000",
    });
  });

  it("keeps the requestId, which is the only handle into the gateway log", () => {
    const parsed = parseProblemDetails(
      problem({ status: 500, code: PROBLEM_CODES.internalError }),
    );

    expect(parsed?.requestId).toBe("01J0000000000000000000");
  });

  it("keeps field-level errors when a service sends them", () => {
    const parsed = parseProblemDetails(
      problem({
        status: 400,
        code: PROBLEM_CODES.validationFailed,
        errors: [{ path: "email", message: "must be an email address" }],
      }),
    );

    expect(parsed?.errors).toEqual([
      { path: "email", message: "must be an email address" },
    ]);
  });
});

describe("the statuses the client meets in production", () => {
  it.each([
    [400, PROBLEM_CODES.validationFailed],
    [401, PROBLEM_CODES.tokenMissing],
    [401, PROBLEM_CODES.tokenInvalid],
    [401, PROBLEM_CODES.tokenWrongType],
    [401, PROBLEM_CODES.tokenStale],
    [403, PROBLEM_CODES.forbidden],
    [404, PROBLEM_CODES.notFound],
    [413, PROBLEM_CODES.payloadTooLarge],
    [429, PROBLEM_CODES.rateLimited],
    [500, PROBLEM_CODES.internalError],
    [503, PROBLEM_CODES.upstreamUnavailable],
  ])("parses %i / %s into a typed problem", (status, code) => {
    const parsed = parseProblemDetails(problem({ status, code }));

    expect(parsed).not.toBeNull();
    expect(parsed?.status).toBe(status);
    expect(parsed?.code).toBe(code);
  });
});

describe("malformed and non-JSON responses", () => {
  it.each([
    ["an HTML error page", "<!doctype html><title>502 Bad Gateway</title>"],
    ["a plain string", "Internal Server Error"],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 502],
    ["an array", [{ status: 500, code: "internal_error" }]],
  ])("returns null for %s rather than throwing", (_label, body) => {
    expect(() => parseProblemDetails(body)).not.toThrow();
    expect(parseProblemDetails(body)).toBeNull();
  });

  it.each([
    ["status missing", { code: "not_found" }],
    ["code missing", { status: 404 }],
    ["status not a number", { status: "404", code: "not_found" }],
    ["status not an integer", { status: 404.5, code: "not_found" }],
    ["code not a string", { status: 404, code: 404 }],
  ])(
    "returns null when %s — the two fields every layer branches on",
    (_l, body) => {
      expect(parseProblemDetails(body)).toBeNull();
    },
  );

  it("returns null rather than a half-built object, so callers cannot read a missing code", () => {
    const parsed = parseProblemDetails({ status: 500 });

    expect(parsed).toBeNull();
  });

  it("tolerates a document that omits every optional field", () => {
    const parsed = parseProblemDetails({ status: 429, code: "rate_limited" });

    expect(parsed).toMatchObject({ status: 429, code: "rate_limited" });
    expect(parsed?.detail).toBeUndefined();
  });
});

describe("deciding what to do with a failure", () => {
  it("treats a stale token as `refresh and retry`, not as a denial", () => {
    const parsed = parseProblemDetails(
      problem({ status: 401, code: PROBLEM_CODES.tokenStale }),
    );

    expect(isCredentialRenewalRequired(parsed)).toBe(true);
  });

  it.each([
    [PROBLEM_CODES.tokenMissing],
    [PROBLEM_CODES.tokenInvalid],
    [PROBLEM_CODES.tokenWrongType],
    [PROBLEM_CODES.tokenStale],
    [PROBLEM_CODES.unauthenticated],
  ])("treats 401 / %s as needing a fresh credential", (code) => {
    const parsed = parseProblemDetails(problem({ status: 401, code }));

    expect(isCredentialRenewalRequired(parsed)).toBe(true);
  });

  it("does NOT treat a 403 as a credential problem", () => {
    const parsed = parseProblemDetails(
      problem({ status: 403, code: PROBLEM_CODES.forbidden }),
    );

    expect(isCredentialRenewalRequired(parsed)).toBe(false);
  });

  it("does not treat a 429 as a credential problem", () => {
    const parsed = parseProblemDetails(
      problem({ status: 429, code: PROBLEM_CODES.rateLimited }),
    );

    expect(isCredentialRenewalRequired(parsed)).toBe(false);
  });

  it("returns false for an unparseable response instead of throwing", () => {
    expect(isCredentialRenewalRequired(null)).toBe(false);
  });

  it.each([
    [PROBLEM_CODES.upstreamUnavailable],
    [PROBLEM_CODES.serviceUnavailable],
  ])("recognises %s as a retryable outage", (code) => {
    const parsed = parseProblemDetails(problem({ status: 503, code }));

    expect(isUpstreamUnavailable(parsed)).toBe(true);
  });

  it("does not confuse an internal error with an upstream outage", () => {
    const parsed = parseProblemDetails(
      problem({ status: 500, code: PROBLEM_CODES.internalError }),
    );

    expect(isUpstreamUnavailable(parsed)).toBe(false);
  });
});

describe("what must never reach the user", () => {
  it("carries no stack, no upstream message and no internal id", () => {
    const parsed = parseProblemDetails(problem({ status: 500 }));

    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed ?? {})).not.toContain("stack");
    expect(Object.keys(parsed ?? {})).not.toContain("cause");
  });

  it("drops unknown extra fields rather than passing them through", () => {
    const parsed = parseProblemDetails({
      status: 500,
      code: "internal_error",
      stack: "Error: at Object.<anonymous> (/srv/app/dist/server.js:1:1)",
      query: "SELECT * FROM users",
    });

    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toContain("SELECT");
    expect(JSON.stringify(parsed)).not.toContain("server.js");
  });
});
