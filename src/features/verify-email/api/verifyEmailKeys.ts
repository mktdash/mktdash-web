export const verifyEmailKeys = {
  all: ["verify-email"] as const,
  verify: () => [...verifyEmailKeys.all, "verify"] as const,
  resend: () => [...verifyEmailKeys.all, "resend"] as const,
} as const;
