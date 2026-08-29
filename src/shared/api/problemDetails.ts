import { z } from "zod";

export const PROBLEM_JSON_CONTENT_TYPE = "application/problem+json";

export const problemDetailsSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export type ProblemFieldError = NonNullable<ProblemDetails["errors"]>[number];

export const parseProblemDetails = (value: unknown): ProblemDetails | null => {
  const result = problemDetailsSchema.safeParse(value);

  return result.success ? result.data : null;
};

export const PROBLEM_CODES = {
  validationFailed: "validation_failed",
  malformedRequest: "malformed_request",
  notFound: "not_found",
  unauthenticated: "unauthenticated",
  forbidden: "forbidden",
  rateLimited: "rate_limited",
  internalError: "internal_error",
  serviceUnavailable: "service_unavailable",
  tokenMissing: "token_missing",
  tokenInvalid: "token_invalid",
  tokenWrongType: "token_wrong_type",
  tokenStale: "token_stale",
  upstreamUnavailable: "upstream_unavailable",
  methodNotAllowed: "method_not_allowed",
  payloadTooLarge: "payload_too_large",
  unsupportedMediaType: "unsupported_media_type",
  emailAlreadyRegistered: "email_already_registered",
  organizationSlugUnavailable: "organization_slug_unavailable",
  passwordBreached: "password_breached",
  invalidVerificationCode: "invalid_verification_code",
  verificationCodeExpired: "verification_code_expired",
  tooManyVerificationAttempts: "too_many_verification_attempts",
  sessionNotEstablished: "session_not_established",
} as const;

export type ProblemCode = (typeof PROBLEM_CODES)[keyof typeof PROBLEM_CODES];

const CREDENTIAL_RENEWAL_CODES: ReadonlySet<string> = new Set([
  PROBLEM_CODES.tokenMissing,
  PROBLEM_CODES.tokenInvalid,
  PROBLEM_CODES.tokenWrongType,
  PROBLEM_CODES.tokenStale,
  PROBLEM_CODES.unauthenticated,
]);

export const isCredentialRenewalRequired = (
  problem: ProblemDetails | null,
): boolean =>
  problem !== null &&
  problem.status === 401 &&
  CREDENTIAL_RENEWAL_CODES.has(problem.code);

export const isUpstreamUnavailable = (
  problem: ProblemDetails | null,
): boolean =>
  problem !== null &&
  (problem.code === PROBLEM_CODES.upstreamUnavailable ||
    problem.code === PROBLEM_CODES.serviceUnavailable);

const PROBLEM_TYPE_BASE_URL = "https://errors.mktdash.io";

export interface CreateProblemInput {
  readonly status: number;
  readonly code: ProblemCode;
  readonly title: string;
  readonly detail: string;
  readonly requestId?: string;
}

export const createProblemResponse = (
  { status, code, title, detail, requestId }: CreateProblemInput,
  headers: Readonly<Record<string, string>> = {},
): Response =>
  Response.json(
    {
      type: `${PROBLEM_TYPE_BASE_URL}/${code.replaceAll("_", "-")}`,
      title,
      status,
      code,
      detail,
      ...(requestId ? { requestId } : {}),
    } satisfies ProblemDetails,
    {
      status,
      headers: {
        "content-type": PROBLEM_JSON_CONTENT_TYPE,
        "cache-control": "no-store",
        ...headers,
      },
    },
  );
