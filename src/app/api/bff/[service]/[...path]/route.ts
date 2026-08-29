import type { NextRequest } from "next/server";
import {
  callGateway,
  copyResponseHeaders,
  isGatewayService,
  mintRequestId,
  REQUEST_ID_HEADER,
  sanitiseRequestHeaders,
} from "@/shared/api/gatewayClient";
import {
  createProblemResponse,
  PROBLEM_CODES,
} from "@/shared/api/problemDetails";
import { verifySession } from "@/shared/auth/session";
import { logProxiedRequest } from "@/shared/lib/serverLogger";

export const runtime = "nodejs";

const METHODS_WITHOUT_BODY: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const STATUSES_WITHOUT_BODY: ReadonlySet<number> = new Set([204, 205, 304]);

const WORKSPACE_HEADER = "x-workspace-id";
const ORGANIZATION_HEADER = "x-org-id";

interface RouteContext {
  readonly params: Promise<{
    readonly service?: string;
    readonly path?: readonly string[];
  }>;
}

const handleProxiedRequest = async (
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> => {
  const startedAt = Date.now();
  const requestId = mintRequestId();

  const { service = "", path = [] } = await params;
  const upstreamPath = `/${path.join("/")}`;
  const requestPath = `/api/bff/${service}${upstreamPath}`;

  const finish = (
    response: Response,
    outcome?: "upstream-unreachable" | "session-expired" | "forbidden",
  ): Response => {
    logProxiedRequest({
      requestId,
      method: request.method,
      path: requestPath,
      service: service || "-",
      upstreamPath,
      status: response.status,
      durationMs: Date.now() - startedAt,
      ...(outcome ? { outcome } : {}),
    });

    return response;
  };

  if (!isGatewayService(service)) {
    return finish(
      createProblemResponse(
        {
          status: 404,
          code: PROBLEM_CODES.notFound,
          title: "Unknown service",
          detail: "That service is not routed by this application.",
          requestId,
        },
        { [REQUEST_ID_HEADER]: requestId },
      ),
    );
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

  const { principal, tokens } = state.session;
  const headers = sanitiseRequestHeaders(request.headers);
  headers.set("authorization", `Bearer ${tokens.accessToken}`);
  headers.set(WORKSPACE_HEADER, principal.workspaceId);
  headers.set(ORGANIZATION_HEADER, principal.organizationId);

  const hasBody =
    !METHODS_WITHOUT_BODY.has(request.method) && request.body !== null;

  try {
    const upstream = await callGateway({
      service,
      path: upstreamPath,
      search: request.nextUrl.search,
      method: request.method,
      headers,
      body: hasBody ? request.body : null,
      requestId,
    });

    const body = STATUSES_WITHOUT_BODY.has(upstream.status)
      ? null
      : upstream.body;

    return finish(
      new Response(body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: copyResponseHeaders(upstream.headers, requestId),
      }),
    );
  } catch {
    return finish(
      createProblemResponse(
        {
          status: 502,
          code: PROBLEM_CODES.serviceUnavailable,
          title: "Upstream unreachable",
          detail:
            "We could not reach that service. Nothing was changed — try again in a moment.",
          requestId,
        },
        { [REQUEST_ID_HEADER]: requestId },
      ),
      "upstream-unreachable",
    );
  }
};

export const GET = handleProxiedRequest;
export const HEAD = handleProxiedRequest;
export const POST = handleProxiedRequest;
export const PUT = handleProxiedRequest;
export const PATCH = handleProxiedRequest;
export const DELETE = handleProxiedRequest;
export const OPTIONS = handleProxiedRequest;
