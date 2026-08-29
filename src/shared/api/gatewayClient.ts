import "server-only";
import { env } from "@/shared/config/env";

export const REQUEST_ID_HEADER = "x-request-id";

const GATEWAY_TIMEOUT_MS = 15_000;

export const GATEWAY_SERVICES = {
  identity: "/v1",
} as const satisfies Readonly<Record<string, string>>;

export type GatewayService = keyof typeof GATEWAY_SERVICES;

export const isGatewayService = (value: string): value is GatewayService =>
  Object.hasOwn(GATEWAY_SERVICES, value);

const STRIPPED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "expect",
  "host",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-org-id",
  "x-organization-id",
  "x-real-ip",
  "x-request-id",
  "x-workspace-id",
]);

const FORWARDED_RESPONSE_HEADERS: readonly string[] = [
  "content-type",
  "cache-control",
  "content-disposition",
  "etag",
  "last-modified",
  "location",
  "retry-after",
  "vary",
  "www-authenticate",
];

export const mintRequestId = (): string => crypto.randomUUID();

export const buildGatewayUrl = (
  service: GatewayService,
  path: string,
  search = "",
): string => {
  const basePath = GATEWAY_SERVICES[service];
  const suffix = path.startsWith("/") ? path : `/${path}`;

  return `${env.API_GATEWAY_URL}${basePath}${suffix}${search}`;
};

export const sanitiseRequestHeaders = (source: Headers): Headers => {
  const headers = new Headers();

  source.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  return headers;
};

export const copyResponseHeaders = (
  source: Headers,
  requestId: string,
): Headers => {
  const headers = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = source.get(name);

    if (value !== null) {
      headers.set(name, value);
    }
  }

  headers.set(REQUEST_ID_HEADER, requestId);

  return headers;
};

type StreamingRequestInit = RequestInit & { duplex?: "half" };

export interface CallGatewayOptions {
  readonly service: GatewayService;
  readonly path: string;
  readonly search?: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body?: BodyInit | null;
  readonly requestId: string;
}

export const callGateway = async ({
  service,
  path,
  search = "",
  method,
  headers,
  body = null,
  requestId,
}: CallGatewayOptions): Promise<Response> => {
  const outboundHeaders = new Headers(headers);
  outboundHeaders.set(REQUEST_ID_HEADER, requestId);

  const init: StreamingRequestInit = {
    method,
    headers: outboundHeaders,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    ...(body === null ? {} : { body, duplex: "half" }),
  };

  return fetch(buildGatewayUrl(service, path, search), init);
};
