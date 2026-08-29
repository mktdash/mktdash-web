import { z } from "zod";
import {
  extractProblemDetails,
  extractResponseStatus,
  extractRetryAfterSeconds,
  httpClient,
} from "@/shared/api/httpClient";
import { PROBLEM_CODES } from "@/shared/api/problemDetails";
import { sanitiseVerificationCode } from "../lib/verificationCode";
import type {
  ResendVerificationFailureCode,
  ResendVerificationOutcome,
  ResendVerificationRequest,
  VerifyEmailFailureCode,
  VerifyEmailOutcome,
  VerifyEmailRequest,
} from "../types/verifyEmail.types";

const VERIFY_PATH = "/auth/verify-email";
const RESEND_PATH = "/auth/resend-verification";

const verifiedResponseSchema = z.object({
  status: z.literal("verified"),
  redirectTo: z.string().min(1),
});

const sentResponseSchema = z.object({
  status: z.literal("sent"),
  retryAfterSeconds: z.number().int().nonnegative(),
});

const VERIFY_FAILURE_BY_PROBLEM_CODE: Readonly<
  Record<string, VerifyEmailFailureCode>
> = {
  [PROBLEM_CODES.invalidVerificationCode]: "invalid-code",
  [PROBLEM_CODES.verificationCodeExpired]: "code-expired",
  [PROBLEM_CODES.tooManyVerificationAttempts]: "too-many-attempts",
  [PROBLEM_CODES.rateLimited]: "too-many-attempts",
  [PROBLEM_CODES.validationFailed]: "invalid-code",
  [PROBLEM_CODES.malformedRequest]: "invalid-code",
  [PROBLEM_CODES.sessionNotEstablished]: "session-not-started",
};

const RESEND_FAILURE_BY_PROBLEM_CODE: Readonly<
  Record<string, ResendVerificationFailureCode>
> = {
  [PROBLEM_CODES.rateLimited]: "rate-limited",
  [PROBLEM_CODES.validationFailed]: "unknown-address",
  [PROBLEM_CODES.malformedRequest]: "unknown-address",
};

export const verifyEmail = async ({
  email,
  code,
}: VerifyEmailRequest): Promise<VerifyEmailOutcome> => {
  try {
    const { data } = await httpClient.post<unknown>(VERIFY_PATH, {
      email: email.trim(),
      code: sanitiseVerificationCode(code),
    });

    const parsed = verifiedResponseSchema.safeParse(data);

    if (!parsed.success) {
      return { status: "failed", code: "service-error" };
    }

    return { status: "verified", redirectTo: parsed.data.redirectTo };
  } catch (error) {
    const problem = extractProblemDetails(error);
    const code: VerifyEmailFailureCode = problem
      ? (VERIFY_FAILURE_BY_PROBLEM_CODE[problem.code] ?? "service-error")
      : extractResponseStatus(error) === null
        ? "request-failed"
        : "service-error";

    return {
      status: "failed",
      code,
      ...(problem?.requestId ? { reference: problem.requestId } : {}),
    };
  }
};

export const resendVerificationCode = async ({
  email,
}: ResendVerificationRequest): Promise<ResendVerificationOutcome> => {
  try {
    const { data } = await httpClient.post<unknown>(RESEND_PATH, {
      email: email.trim(),
    });

    const parsed = sentResponseSchema.safeParse(data);

    if (!parsed.success) {
      return {
        status: "failed",
        code: "request-failed",
        retryAfterSeconds: 0,
      };
    }

    return { status: "sent", retryAfterSeconds: parsed.data.retryAfterSeconds };
  } catch (error) {
    const problem = extractProblemDetails(error);

    if (!problem) {
      return {
        status: "failed",
        code: "request-failed",
        retryAfterSeconds: 0,
      };
    }

    return {
      status: "failed",
      code: RESEND_FAILURE_BY_PROBLEM_CODE[problem.code] ?? "request-failed",
      retryAfterSeconds: extractRetryAfterSeconds(error) ?? 0,
    };
  }
};
