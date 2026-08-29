export const signUpKeys = {
  all: ["sign-up"] as const,
  register: () => [...signUpKeys.all, "register"] as const,
} as const;
