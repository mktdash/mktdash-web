export const TENANCY_MODES = ["company", "agency"] as const;

export type TenancyMode = (typeof TENANCY_MODES)[number];

export type SignUpStep = 1 | 2;

export interface SignUpDetails {
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
  readonly workspaceName: string;
  readonly tenancy: TenancyMode;
}

export type SignUpFailureCode =
  | "email-taken"
  | "password-breached"
  | "workspace-name-unavailable"
  | "invalid-details"
  | "rate-limited"
  | "request-failed";

export interface SignUpFieldError {
  readonly path: string;
  readonly message: string;
}

export type SignUpOutcome =
  | {
      readonly status: "verification-required";
      readonly email: string;
      readonly expiresInSeconds: number;
      readonly resendAvailableInSeconds: number;
    }
  | {
      readonly status: "failed";
      readonly code: SignUpFailureCode;
      readonly fieldErrors?: readonly SignUpFieldError[];
    };

export type PasswordStrengthTone = "neutral" | "danger" | "warning" | "success";

export interface PasswordStrength {
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly label: string;
  readonly tone: PasswordStrengthTone;
  readonly isAcceptable: boolean;
  readonly isBreached: boolean;
}
