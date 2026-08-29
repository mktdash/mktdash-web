"use client";

import { useId, useRef, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";
import { useResendCooldown } from "../hooks/useResendCooldown";
import { useResendVerificationCode } from "../hooks/useResendVerificationCode";
import { useVerifyEmail } from "../hooks/useVerifyEmail";
import {
  RESEND_COOLDOWN_SECONDS,
  VERIFICATION_CODE_LENGTH,
  isCompleteVerificationCode,
} from "../lib/verificationCode";
import {
  verifyEmailSchema,
  type VerifyEmailFormValues,
} from "../schemas/verifyEmail.schema";
import type {
  ResendVerificationFailureCode,
  VerifyEmailFailureCode,
} from "../types/verifyEmail.types";
import VerificationCodeField from "./VerificationCodeField";
import VerifyEmailResendPrompt from "./VerifyEmailResendPrompt";

export interface VerifyEmailFormProps {
  readonly email: string;
}

const VERIFY_FAILURE_MESSAGE: Record<VerifyEmailFailureCode, string> = {
  "invalid-code": `That code is not right. Check the ${VERIFICATION_CODE_LENGTH} digits in the email and try again.`,
  "code-expired":
    "That code has expired. Send a new one and enter the code from the newest email.",
  "too-many-attempts":
    "Too many incorrect attempts. Send a new code before trying again.",
  "service-error":
    "Something went wrong on our side, so we could not confirm your code. Your code has not been used up — try again in a moment.",
  "session-not-started":
    "Your email is confirmed, but we could not start your session. Sign in to continue — do not request another code.",
  "request-failed":
    "We could not reach the verification service. Check your connection and try again.",
};

const RESEND_FAILURE_MESSAGE: Record<ResendVerificationFailureCode, string> = {
  "rate-limited":
    "A code was sent very recently. Wait for the countdown before asking for another.",
  "unknown-address":
    "We do not recognise that address. Start again from sign-up.",
  "request-failed":
    "We could not send another code just now. Try again in a moment.",
};

const VerifyEmailForm = ({ email }: VerifyEmailFormProps) => {
  const router = useRouter();

  const codeInputRef = useRef<HTMLInputElement>(null);

  const [failureCode, setFailureCode] = useState<VerifyEmailFailureCode | null>(
    null,
  );
  const [failureReference, setFailureReference] = useState<string | null>(null);
  const [resendFailureCode, setResendFailureCode] =
    useState<ResendVerificationFailureCode | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const verifyMutation = useVerifyEmail();
  const resendMutation = useResendVerificationCode();
  const cooldown = useResendCooldown();

  const form = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailSchema),
    mode: "onSubmit",
    defaultValues: { code: "" },
  });

  const { field } = useController({ control: form.control, name: "code" });

  const codeId = useId();
  const codeHintId = `${codeId}-hint`;
  const codeErrorId = `${codeId}-error`;

  const isVerifying = verifyMutation.isPending;
  const isBusy = isVerifying || isRedirecting;

  const runVerification = async (code: string) => {
    if (isBusy) {
      return;
    }

    setFailureCode(null);
    setFailureReference(null);
    setResendFailureCode(null);
    setResendNotice(null);

    try {
      const outcome = await verifyMutation.mutateAsync({ email, code });

      if (outcome.status === "failed") {
        setFailureCode(outcome.code);
        setFailureReference(outcome.reference ?? null);

        if (outcome.code !== "service-error") {
          field.onChange("");
        }

        codeInputRef.current?.focus();
        return;
      }

      setIsRedirecting(true);
      router.replace(outcome.redirectTo);
    } catch {
      setFailureCode("request-failed");
      codeInputRef.current?.focus();
    }
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    void form.handleSubmit(({ code }) => runVerification(code))(event);
  };

  const handleResend = async () => {
    if (resendMutation.isPending || cooldown.isCoolingDown) {
      return;
    }

    setFailureCode(null);
    setFailureReference(null);
    setResendFailureCode(null);
    setResendNotice(null);

    try {
      const outcome = await resendMutation.mutateAsync({ email });

      if (outcome.status === "failed") {
        setResendFailureCode(outcome.code);
        cooldown.start(outcome.retryAfterSeconds);
        return;
      }

      form.reset({ code: "" });
      cooldown.start(outcome.retryAfterSeconds || RESEND_COOLDOWN_SECONDS);
      setResendNotice(`A new code is on its way to ${email}.`);
      codeInputRef.current?.focus();
    } catch {
      setResendFailureCode("request-failed");
    }
  };

  const codeError = form.formState.errors.code;
  const isInvalid = Boolean(failureCode) || Boolean(codeError);
  const canSubmit = isCompleteVerificationCode(field.value);

  return (
    <>
      <form noValidate onSubmit={handleSubmit} className="mt-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor={codeId}>
            {VERIFICATION_CODE_LENGTH}-digit verification code
          </Label>

          <VerificationCodeField
            id={codeId}
            value={field.value}
            inputRef={codeInputRef}
            isDisabled={isBusy}
            isInvalid={isInvalid}
            describedBy={
              [failureCode || codeError ? codeErrorId : null, codeHintId]
                .filter(Boolean)
                .join(" ") || undefined
            }
            onChange={field.onChange}
            onBlur={field.onBlur}
          />

          {failureCode ? (
            <div
              id={codeErrorId}
              role="alert"
              className="mt-1 flex animate-fa-in items-start gap-2.25 rounded-2xl border border-danger-100 bg-danger-050 px-3.25 py-2.75"
            >
              <CircleAlert
                aria-hidden
                className="mt-px size-3.5 flex-none text-danger-600"
                strokeWidth={2}
              />
              <div className="flex flex-col gap-1">
                <p className="text-base leading-normal font-medium text-danger-600">
                  {VERIFY_FAILURE_MESSAGE[failureCode]}
                  {failureCode === "session-not-started" ? (
                    <>
                      {" "}
                      <Link
                        href="/login"
                        className="font-bold text-link hover:text-link-hover"
                      >
                        Go to sign in
                      </Link>
                      .
                    </>
                  ) : null}
                </p>

                {failureReference ? (
                  <p className="text-xs leading-normal font-medium text-text-8">
                    Reference {failureReference}
                  </p>
                ) : null}
              </div>
            </div>
          ) : codeError ? (
            <p id={codeErrorId} className="text-xs font-bold text-danger-600">
              {codeError.message}
            </p>
          ) : null}

          <p
            id={codeHintId}
            className="text-xs leading-normal font-medium text-text-8"
          >
            Paste the whole code and it fills every box.
          </p>

          <Button
            type="submit"
            disabled={isBusy}
            className={cn(
              "mt-1 h-11 w-full rounded-3xl text-md",
              !canSubmit &&
                "bg-surface-6 text-text-9 shadow-none hover:bg-surface-5 hover:text-text-5 hover:shadow-none",
            )}
          >
            {isRedirecting
              ? "Taking you to your dashboard…"
              : isVerifying
                ? "Confirming…"
                : "Confirm email"}
          </Button>
        </div>
      </form>

      <VerifyEmailResendPrompt
        isResending={resendMutation.isPending}
        secondsRemaining={cooldown.secondsRemaining}
        notice={resendNotice}
        errorMessage={
          resendFailureCode ? RESEND_FAILURE_MESSAGE[resendFailureCode] : null
        }
        onResend={() => void handleResend()}
      />
    </>
  );
};

export default VerifyEmailForm;
