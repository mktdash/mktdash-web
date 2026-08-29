import { http, HttpResponse, type HttpHandler } from "msw";
import { PROBLEM_JSON_CONTENT_TYPE } from "@/shared/api/problemDetails";
import type { ProblemDetails } from "@/shared/api/problemDetails";
import {
  registerResponse,
  resendResponse,
  VERIFICATION_CODE,
  verifiedResponse,
} from "@/test/fixtures/auth.fixtures";

export const AUTH_ENDPOINTS = {
  signUp: "/api/auth/sign-up",
  verifyEmail: "/api/auth/verify-email",
  resendVerification: "/api/auth/resend-verification",
  signOut: "/api/auth/sign-out",
  session: "/api/auth/session",
} as const;

export const problemResponse = (
  problem: ProblemDetails,
  headers: Readonly<Record<string, string>> = {},
) =>
  HttpResponse.json(problem, {
    status: problem.status,
    headers: { "content-type": PROBLEM_JSON_CONTENT_TYPE, ...headers },
  });

interface VerifyEmailRequestBody {
  readonly email?: string;
  readonly code?: string;
}

export const authHandlers: readonly HttpHandler[] = [
  http.post(AUTH_ENDPOINTS.signUp, () =>
    HttpResponse.json(registerResponse, { status: 202 }),
  ),

  http.post(AUTH_ENDPOINTS.verifyEmail, async ({ request }) => {
    const body = (await request.json()) as VerifyEmailRequestBody;

    if (body.code !== VERIFICATION_CODE) {
      return problemResponse({
        type: "https://errors.mktdash.io/invalid-verification-code",
        title: "Invalid verification code",
        status: 400,
        code: "invalid_verification_code",
        detail: "That code is not correct. Check the code and try again.",
      });
    }

    return HttpResponse.json(verifiedResponse, { status: 200 });
  }),

  http.post(AUTH_ENDPOINTS.resendVerification, () =>
    HttpResponse.json(resendResponse, { status: 202 }),
  ),

  http.post(
    AUTH_ENDPOINTS.signOut,
    () => new HttpResponse(null, { status: 204 }),
  ),

  http.get(AUTH_ENDPOINTS.session, () =>
    problemResponse({
      type: "https://errors.mktdash.io/unauthenticated",
      title: "No active session",
      status: 401,
      code: "unauthenticated",
      detail: "Sign in to continue.",
    }),
  ),
];
