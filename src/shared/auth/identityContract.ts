import { z } from "zod";

export const identityUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  emailVerified: z.boolean(),
});

export const identityOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  tenancy: z.enum(["company", "agency"]),
});

export const identityWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

export const identityTokenPairSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().min(1),
  refreshExpiresIn: z.number().int().positive(),
});

export const verifyEmailUpstreamResponseSchema = z.object({
  status: z.literal("verified"),
  redirectTo: z.string(),
  user: identityUserSchema,
  organization: identityOrganizationSchema,
  workspace: identityWorkspaceSchema,
  tokens: identityTokenPairSchema,
});

export type VerifyEmailUpstreamResponse = z.infer<
  typeof verifyEmailUpstreamResponseSchema
>;

export interface VerifyEmailBrowserResponse {
  readonly status: "verified";
  readonly redirectTo: string;
  readonly user: z.infer<typeof identityUserSchema>;
  readonly organization: z.infer<typeof identityOrganizationSchema>;
  readonly workspace: z.infer<typeof identityWorkspaceSchema>;
}
