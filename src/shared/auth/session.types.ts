export interface SessionPrincipal {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}

export interface SessionTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: number;
}

export interface Session {
  readonly principal: SessionPrincipal;
  readonly tokens: SessionTokens;
}

export type SessionState =
  | { readonly status: "active"; readonly session: Session }
  | { readonly status: "expired" }
  | { readonly status: "anonymous" };

export interface IdentityTokenPair {
  readonly accessToken: string;
  readonly tokenType: "Bearer";
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresIn: number;
}
