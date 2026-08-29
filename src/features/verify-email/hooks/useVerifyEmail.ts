"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { verifyEmailKeys } from "../api/verifyEmailKeys";
import { verifyEmail } from "../api/verifyEmailService";
import type {
  VerifyEmailOutcome,
  VerifyEmailRequest,
} from "../types/verifyEmail.types";

export const useVerifyEmail = (): UseMutationResult<
  VerifyEmailOutcome,
  Error,
  VerifyEmailRequest
> =>
  useMutation({
    mutationKey: verifyEmailKeys.verify(),
    mutationFn: verifyEmail,
  });
