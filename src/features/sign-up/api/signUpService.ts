import { z } from "zod";
import { extractProblemDetails, httpClient } from "@/shared/api/httpClient";
import { PROBLEM_CODES } from "@/shared/api/problemDetails";
import type {
  SignUpDetails,
  SignUpFailureCode,
  SignUpFieldError,
  SignUpOutcome,
} from "../types/signUp.types";

const SIGN_UP_PATH = "/auth/sign-up";

const registerResponseSchema = z.object({
  status: z.literal("verification-required"),
  email: z.string(),
  expiresInSeconds: z.number().int(),
  resendAvailableInSeconds: z.number().int(),
});

const FAILURE_BY_PROBLEM_CODE: Readonly<Record<string, SignUpFailureCode>> = {
  [PROBLEM_CODES.emailAlreadyRegistered]: "email-taken",
  [PROBLEM_CODES.passwordBreached]: "password-breached",
  [PROBLEM_CODES.organizationSlugUnavailable]: "workspace-name-unavailable",
  [PROBLEM_CODES.validationFailed]: "invalid-details",
  [PROBLEM_CODES.malformedRequest]: "invalid-details",
  [PROBLEM_CODES.rateLimited]: "rate-limited",
};

const failureForStatus = (status: number): SignUpFailureCode =>
  status === 429 ? "rate-limited" : "request-failed";

export const registerAccount = async (
  details: SignUpDetails,
): Promise<SignUpOutcome> => {
  try {
    const { data } = await httpClient.post<unknown>(SIGN_UP_PATH, {
      fullName: details.fullName.trim(),
      email: details.email.trim(),
      password: details.password,
      workspaceName: details.workspaceName.trim(),
      tenancy: details.tenancy,
    });

    const parsed = registerResponseSchema.safeParse(data);

    if (!parsed.success) {
      return { status: "failed", code: "request-failed" };
    }

    return {
      status: "verification-required",
      email: parsed.data.email,
      expiresInSeconds: parsed.data.expiresInSeconds,
      resendAvailableInSeconds: parsed.data.resendAvailableInSeconds,
    };
  } catch (error) {
    const problem = extractProblemDetails(error);

    if (!problem) {
      return { status: "failed", code: "request-failed" };
    }

    const code =
      FAILURE_BY_PROBLEM_CODE[problem.code] ?? failureForStatus(problem.status);

    const fieldErrors: readonly SignUpFieldError[] = problem.errors ?? [];

    return fieldErrors.length > 0
      ? { status: "failed", code, fieldErrors }
      : { status: "failed", code };
  }
};
