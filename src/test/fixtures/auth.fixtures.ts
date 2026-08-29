import type { ProblemDetails } from "@/shared/api/problemDetails";
import type { VerifyEmailBrowserResponse } from "@/shared/auth/identityContract";

export const VERIFIED_EMAIL = "priya@acme.co";

export const VERIFICATION_CODE = "482913";

export interface RegisterResponseBody {
  readonly status: "verification-required";
  readonly email: string;
  readonly expiresInSeconds: number;
  readonly resendAvailableInSeconds: number;
}

export const registerResponse: RegisterResponseBody = {
  status: "verification-required",
  email: VERIFIED_EMAIL,
  expiresInSeconds: 900,
  resendAvailableInSeconds: 60,
};

export const verifiedResponse: VerifyEmailBrowserResponse = {
  status: "verified",
  redirectTo: "/w/acme-co/home",
  user: {
    id: "018f4c2e-2f7a-7c1e-9f3a-6a1b2c3d4e5f",
    email: VERIFIED_EMAIL,
    fullName: "Priya Raman",
    emailVerified: true,
  },
  organization: {
    id: "018f4c2e-3a11-7b22-8c33-9d44e55f6607",
    name: "Acme Co.",
    slug: "acme-co",
    tenancy: "company",
  },
  workspace: {
    id: "018f4c2e-4b22-7c33-8d44-9e55f6607718",
    name: "Acme Co.",
    slug: "acme-co",
  },
};

export interface ResendResponseBody {
  readonly status: "sent";
  readonly retryAfterSeconds: number;
}

export const resendResponse: ResendResponseBody = {
  status: "sent",
  retryAfterSeconds: 60,
};

export interface ProblemFixtureInput {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly errors?: readonly { path: string; message: string }[];
}

export const problemDetails = ({
  status,
  code,
  title,
  detail,
  errors,
}: ProblemFixtureInput): ProblemDetails => ({
  type: `https://errors.mktdash.io/${code.replaceAll("_", "-")}`,
  title,
  status,
  code,
  detail,
  requestId: "018f4c2e-9999-7000-8111-222233334444",
  ...(errors ? { errors: [...errors] } : {}),
});

export const emailAlreadyRegisteredProblem = problemDetails({
  status: 409,
  code: "email_already_registered",
  title: "Email already registered",
  detail:
    "An account with this email address already exists. Sign in instead, or reset the password.",
});

export const invalidVerificationCodeProblem = problemDetails({
  status: 400,
  code: "invalid_verification_code",
  title: "Invalid verification code",
  detail: "That code is not correct. Check the code and try again.",
});

export const rateLimitedProblem = problemDetails({
  status: 429,
  code: "rate_limited",
  title: "Too many requests",
  detail: "Too many requests. Try again shortly.",
});
