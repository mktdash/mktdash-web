"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import { useSignUp } from "../hooks/useSignUp";
import { signUpSchema, type SignUpFormValues } from "../schemas/signUp.schema";
import type {
  SignUpFailureCode,
  SignUpFieldError,
  SignUpOutcome,
  SignUpStep,
} from "../types/signUp.types";
import SignUpAccountStep from "./SignUpAccountStep";
import SignUpStepIndicator from "./SignUpStepIndicator";
import SignUpWorkspaceStep from "./SignUpWorkspaceStep";

const ACCOUNT_FIELDS = ["fullName", "email", "password"] as const;

const FORM_FIELDS = [
  ...ACCOUNT_FIELDS,
  "workspaceName",
  "tenancy",
] as const satisfies readonly (keyof SignUpFormValues)[];

const FAILURE_MESSAGE: Record<SignUpFailureCode, string> = {
  "email-taken":
    "An account already exists for that email address. Sign in instead, or use a different one.",
  "password-breached":
    "That password appears in known breach lists. Pick another one before continuing.",
  "workspace-name-unavailable":
    "That workspace name could not be reserved. Try a slightly different one.",
  "invalid-details":
    "Some of those details were rejected. Check the highlighted fields and try again.",
  "rate-limited":
    "Too many sign-up attempts from here. Wait a minute, then try again.",
  "request-failed":
    "We could not reach the sign-up service. Nothing was created — check your connection and try again.",
};

const STEP_FOR_FAILURE: Record<SignUpFailureCode, SignUpStep | null> = {
  "email-taken": 1,
  "password-breached": 1,
  "workspace-name-unavailable": 2,
  "invalid-details": null,
  "rate-limited": null,
  "request-failed": null,
};

const toFormField = (path: string): keyof SignUpFormValues | null => {
  const leaf = path.split(".").at(-1) ?? "";

  return FORM_FIELDS.find((field) => field === leaf) ?? null;
};

const SignUpForm = () => {
  const router = useRouter();

  const [step, setStep] = useState<SignUpStep>(1);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [failureCode, setFailureCode] = useState<SignUpFailureCode | null>(
    null,
  );

  const signUpMutation = useSignUp();

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    mode: "onTouched",
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      workspaceName: "",
      tenancy: "company",
    },
  });

  useEffect(() => {
    return form.subscribe({
      name: ACCOUNT_FIELDS,
      formState: { values: true },
      callback: ({ name }) => {
        const field = ACCOUNT_FIELDS.find((candidate) => candidate === name);
        if (field && form.getFieldState(field).error) {
          void form.trigger(field);
        }
      },
    });
  }, [form]);

  const goToWorkspaceStep = async () => {
    setFailureCode(null);

    const isAccountValid = await form.trigger([...ACCOUNT_FIELDS]);
    if (!isAccountValid) {
      const firstInvalidField = ACCOUNT_FIELDS.find(
        (field) => form.getFieldState(field).invalid,
      );
      if (firstInvalidField) {
        form.setFocus(firstInvalidField);
      }
      return;
    }

    setStep(2);
  };

  const goToAccountStep = () => {
    setFailureCode(null);
    setStep(1);
  };

  const applyFieldErrors = (
    fieldErrors: readonly SignUpFieldError[],
  ): boolean => {
    let rejectedAnAccountField = false;

    for (const { path, message } of fieldErrors) {
      const field = toFormField(path);

      if (!field) {
        continue;
      }

      form.setError(field, { type: "server", message });

      if (ACCOUNT_FIELDS.some((candidate) => candidate === field)) {
        rejectedAnAccountField = true;
      }
    }

    return rejectedAnAccountField;
  };

  const submitSignUp = form.handleSubmit(async (values) => {
    setFailureCode(null);

    const transportFailure: SignUpOutcome = {
      status: "failed",
      code: "request-failed",
    };

    const outcome = await signUpMutation
      .mutateAsync(values)
      .catch(() => transportFailure);

    if (outcome.status === "failed") {
      const rejectedAnAccountField = applyFieldErrors(
        outcome.fieldErrors ?? [],
      );

      setFailureCode(outcome.code);

      const targetStep =
        STEP_FOR_FAILURE[outcome.code] ?? (rejectedAnAccountField ? 1 : null);

      if (targetStep) {
        setStep(targetStep);
      }

      return;
    }

    router.replace(`/verify-email?email=${encodeURIComponent(outcome.email)}`);
  });

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (step === 1) {
      event.preventDefault();
      void goToWorkspaceStep();
      return;
    }

    void submitSignUp(event);
  };

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={handleSubmit}>
        <div className="mb-4.75">
          <SignUpStepIndicator currentStep={step} />
        </div>

        {failureCode ? (
          <div
            role="alert"
            className="mb-3.75 flex animate-fa-in items-start gap-2.25 rounded-2xl border border-danger-100 bg-danger-050 px-3.25 py-2.75"
          >
            <CircleAlert
              aria-hidden
              className="mt-px size-3.5 flex-none text-danger-600"
              strokeWidth={2}
            />
            <p className="text-base leading-normal font-medium text-danger-600">
              {FAILURE_MESSAGE[failureCode]}
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <SignUpAccountStep
            isPasswordVisible={isPasswordVisible}
            onPasswordVisibilityToggle={() =>
              setIsPasswordVisible((visible) => !visible)
            }
          />
        ) : (
          <SignUpWorkspaceStep
            isSubmitting={
              form.formState.isSubmitting || signUpMutation.isPending
            }
            onBack={goToAccountStep}
          />
        )}
      </form>
    </FormProvider>
  );
};

export default SignUpForm;
