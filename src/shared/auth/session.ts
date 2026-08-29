import "server-only";
import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";
import { env } from "@/shared/config/env";
import type {
  IdentityTokenPair,
  Session,
  SessionPrincipal,
  SessionState,
} from "./session.types";

export const SESSION_COOKIE_NAME = "mktdash_session";

const SESSION_ISSUER = "mktdash-web";
const SESSION_AUDIENCE = "mktdash-web-bff";

const KEY_ALGORITHM = "dir";
const CONTENT_ENCRYPTION = "A256GCM";
const KEY_BYTE_LENGTH = 32;

const MAX_COOKIE_BYTES = 4096;
const COOKIE_ATTRIBUTE_BUDGET_BYTES = 128;

interface SessionClaims extends JWTPayload {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: number;
}

let cachedKey: Uint8Array | null = null;

const getEncryptionKey = (): Uint8Array => {
  if (cachedKey) {
    return cachedKey;
  }

  const normalised = env.SESSION_SECRET.replaceAll("-", "+").replaceAll(
    "_",
    "/",
  );
  const key = new Uint8Array(Buffer.from(normalised, "base64"));

  if (key.byteLength !== KEY_BYTE_LENGTH) {
    throw new Error(
      `SESSION_SECRET must decode to ${KEY_BYTE_LENGTH} bytes for ${CONTENT_ENCRYPTION}; got ${key.byteLength}. Generate one with \`openssl rand -base64 32\`.`,
    );
  }

  cachedKey = key;

  return key;
};

const buildCookieAttributes = (maxAgeSeconds: number) =>
  ({
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  }) as const;

const nowInSeconds = (): number => Math.floor(Date.now() / 1000);

const isSessionClaims = (payload: JWTPayload): payload is SessionClaims => {
  const candidate = payload as Partial<SessionClaims>;

  return (
    typeof candidate.userId === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.fullName === "string" &&
    typeof candidate.organizationId === "string" &&
    typeof candidate.organizationSlug === "string" &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.workspaceSlug === "string" &&
    typeof candidate.accessToken === "string" &&
    typeof candidate.accessTokenExpiresAt === "number" &&
    typeof candidate.refreshToken === "string" &&
    typeof candidate.refreshTokenExpiresAt === "number"
  );
};

const toSession = (claims: SessionClaims): Session => ({
  principal: {
    userId: claims.userId,
    email: claims.email,
    fullName: claims.fullName,
    organizationId: claims.organizationId,
    organizationSlug: claims.organizationSlug,
    workspaceId: claims.workspaceId,
    workspaceSlug: claims.workspaceSlug,
  },
  tokens: {
    accessToken: claims.accessToken,
    accessTokenExpiresAt: claims.accessTokenExpiresAt,
    refreshToken: claims.refreshToken,
    refreshTokenExpiresAt: claims.refreshTokenExpiresAt,
  },
});

export interface CreateSessionInput {
  readonly principal: SessionPrincipal;
  readonly tokens: IdentityTokenPair;
}

export const createSession = async ({
  principal,
  tokens,
}: CreateSessionInput): Promise<void> => {
  const issuedAt = nowInSeconds();
  const accessTokenExpiresAt = issuedAt + tokens.expiresIn;
  const refreshTokenExpiresAt = issuedAt + tokens.refreshExpiresIn;

  const claims: SessionClaims = {
    ...principal,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt,
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt,
  };

  const sealed = await new EncryptJWT(claims)
    .setProtectedHeader({ alg: KEY_ALGORITHM, enc: CONTENT_ENCRYPTION })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(refreshTokenExpiresAt)
    .encrypt(getEncryptionKey());

  const cookieBytes =
    SESSION_COOKIE_NAME.length + sealed.length + COOKIE_ATTRIBUTE_BUDGET_BYTES;

  if (cookieBytes > MAX_COOKIE_BYTES) {
    throw new Error(
      `Sealed session is ${cookieBytes} bytes, over the ${MAX_COOKIE_BYTES}-byte cookie limit. Drop fields from the session rather than truncating it.`,
    );
  }

  const store = await cookies();

  store.set(
    SESSION_COOKIE_NAME,
    sealed,
    buildCookieAttributes(tokens.refreshExpiresIn),
  );
};

export const readSession = async (): Promise<Session | null> => {
  const store = await cookies();
  const sealed = store.get(SESSION_COOKIE_NAME)?.value;

  if (!sealed) {
    return null;
  }

  try {
    const { payload } = await jwtDecrypt(sealed, getEncryptionKey(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      keyManagementAlgorithms: [KEY_ALGORITHM],
      contentEncryptionAlgorithms: [CONTENT_ENCRYPTION],
    });

    return isSessionClaims(payload) ? toSession(payload) : null;
  } catch {
    return null;
  }
};

export const verifySession = async (): Promise<SessionState> => {
  const session = await readSession();

  if (!session) {
    return { status: "anonymous" };
  }

  const now = nowInSeconds();

  if (
    session.tokens.refreshTokenExpiresAt <= now ||
    session.tokens.accessTokenExpiresAt <= now
  ) {
    return { status: "expired" };
  }

  return { status: "active", session };
};

export const destroySession = async (): Promise<void> => {
  const store = await cookies();

  store.set(SESSION_COOKIE_NAME, "", buildCookieAttributes(0));
};
