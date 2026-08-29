import type { NextRequest } from "next/server";
import {
  callGateway,
  copyResponseHeaders,
  mintRequestId,
  REQUEST_ID_HEADER,
} from "@/shared/api/gatewayClient";
import {
  createProblemResponse,
  parseProblemDetails,
  PROBLEM_CODES,
} from "@/shared/api/problemDetails";
import {
  verifyEmailUpstreamResponseSchema,
  type VerifyEmailBrowserResponse,
} from "@/shared/auth/identityContract";
import {
  createSession,
  destroySession,
  verifySession,
} from "@/shared/auth/session";
import { logProxiedRequest } from "@/shared/lib/serverLogger";

export const runtime = "nodejs";

const IDENTITY_SERVICE = "identity";
const GATEWAY_BACKED_ACTIONS = {
  "sign-up": "/auth/register",
  "verify-email": "/auth/verify-email",
  "resend-verification": "/auth/verify-email/resend",
} as const;

type GatewayBackedAction = keyof typeof GATEWAY_BACKED_ACTIONS;

const isGatewayBackedAction = (value: string): value is GatewayBackedAction =>
  Object.hasOwn(GATEWAY_BACKED_ACTIONS, value);

const resolveAction = async (
  params: Promise<{ auth?: readonly string[] }>,
): Promise<string> => {
  const { auth } = await params;

  return (auth ?? []).join("/");
};

const parseJson = (text: string): unknown => {
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const noStoreJson = (
  body: unknown,
  status: number,
  requestId: string,
): Response =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      [REQUEST_ID_HEADER]: requestId,
    },
  });

const unknownActionResponse = (requestId: string): Response =>
  createProblemResponse(
    {
      status: 404,
      code: PROBLEM_CODES.notFound,
      title: "Unknown auth action",
      detail: "That authentication endpoint does not exist.",
      requestId,
    },
    { [REQUEST_ID_HEADER]: requestId },
  );

interface UpstreamCall {
  readonly response: Response;
  readonly bodyText: string;
}

const callIdentity = async (
  request: NextRequest,
  path: string,
  requestId: string,
): Promise<UpstreamCall | null> => {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json",
  });

  const requestBody = await request.text();

  try {
    const response = await callGateway({
      service: IDENTITY_SERVICE,
      path,
      method: "POST",
      headers,
      body: requestBody,
      requestId,
    });

    return { response, bodyText: await response.text() };
  } catch {
    return null;
  }
};

const forwardUpstream = (
  { response, bodyText }: UpstreamCall,
  requestId: string,
): Response =>
  new Response(bodyText.length > 0 ? bodyText : null, {
    status: response.status,
    headers: copyResponseHeaders(response.headers, requestId),
  });

const handleVerifyEmail = async (
  call: UpstreamCall,
  requestId: string,
): Promise<Response> => {
  if (!call.response.ok) {
    return forwardUpstream(call, requestId);
  }

  const parsed = verifyEmailUpstreamResponseSchema.safeParse(
    parseJson(call.bodyText),
  );

  if (!parsed.success) {
    return createProblemResponse(
      {
        status: 502,
        code: PROBLEM_CODES.sessionNotEstablished,
        title: "Unexpected verification response",
        detail:
          "Your email was confirmed but we could not start your session. Try signing in.",
        requestId,
      },
      { [REQUEST_ID_HEADER]: requestId },
    );
  }

  const { tokens, user, organization, workspace, redirectTo, status } =
    parsed.data;

  await createSession({
    principal: {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
    },
    tokens,
  });

  const browserResponse: VerifyEmailBrowserResponse = {
    status,
    redirectTo,
    user,
    organization,
    workspace,
  };

  return noStoreJson(browserResponse, 200, requestId);
};

export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ auth?: readonly string[] }> },
): Promise<Response> => {
  const startedAt = Date.now();
  const requestId = mintRequestId();
  const action = await resolveAction(params);
  const path = `/api/auth/${action}`;

  if (action === "sign-out") {
    await destroySession();

    logProxiedRequest({
      requestId,
      method: "POST",
      path,
      service: IDENTITY_SERVICE,
      upstreamPath: "-",
      status: 204,
      durationMs: Date.now() - startedAt,
    });

    return new Response(null, {
      status: 204,
      headers: { [REQUEST_ID_HEADER]: requestId },
    });
  }

  if (!isGatewayBackedAction(action)) {
    const response = unknownActionResponse(requestId);

    logProxiedRequest({
      requestId,
      method: "POST",
      path,
      service: IDENTITY_SERVICE,
      upstreamPath: "-",
      status: response.status,
      durationMs: Date.now() - startedAt,
    });

    return response;
  }

  const upstreamPath = GATEWAY_BACKED_ACTIONS[action];
  const call = await callIdentity(request, upstreamPath, requestId);

  if (!call) {
    logProxiedRequest({
      requestId,
      method: "POST",
      path,
      service: IDENTITY_SERVICE,
      upstreamPath,
      status: 502,
      durationMs: Date.now() - startedAt,
      outcome: "upstream-unreachable",
    });

    return createProblemResponse(
      {
        status: 502,
        code: PROBLEM_CODES.serviceUnavailable,
        title: "Identity service unreachable",
        detail:
          "We could not reach the sign-up service. Nothing was created — try again in a moment.",
        requestId,
      },
      { [REQUEST_ID_HEADER]: requestId },
    );
  }

  const response =
    action === "verify-email"
      ? await handleVerifyEmail(call, requestId)
      : forwardUpstream(call, requestId);

  const problem = call.response.ok
    ? null
    : parseProblemDetails(parseJson(call.bodyText));

  logProxiedRequest({
    requestId,
    method: "POST",
    path,
    service: IDENTITY_SERVICE,
    upstreamPath,
    status: response.status,
    durationMs: Date.now() - startedAt,
    ...(problem ? { problemCode: problem.code } : {}),
  });

  return response;
};

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ auth?: readonly string[] }> },
): Promise<Response> => {
  const startedAt = Date.now();
  const requestId = mintRequestId();
  const action = await resolveAction(params);
  const path = `/api/auth/${action}`;

  const finish = (
    response: Response,
    outcome?: "session-expired",
  ): Response => {
    logProxiedRequest({
      requestId,
      method: "GET",
      path,
      service: IDENTITY_SERVICE,
      upstreamPath: "-",
      status: response.status,
      durationMs: Date.now() - startedAt,
      ...(outcome ? { outcome } : {}),
    });

    return response;
  };

  if (action !== "session") {
    return finish(unknownActionResponse(requestId));
  }

  const state = await verifySession();

  if (state.status !== "active") {
    return finish(
      createProblemResponse(
        {
          status: 401,
          code: PROBLEM_CODES.unauthenticated,
          title: "No active session",
          detail: "Sign in to continue.",
          requestId,
        },
        { [REQUEST_ID_HEADER]: requestId },
      ),
      state.status === "expired" ? "session-expired" : undefined,
    );
  }

  return finish(noStoreJson(state.session.principal, 200, requestId));
};
