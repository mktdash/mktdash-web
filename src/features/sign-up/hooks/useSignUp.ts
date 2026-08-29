"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { signUpKeys } from "../api/signUpKeys";
import { registerAccount } from "../api/signUpService";
import type { SignUpDetails, SignUpOutcome } from "../types/signUp.types";

export const useSignUp = (): UseMutationResult<
  SignUpOutcome,
  Error,
  SignUpDetails
> =>
  useMutation({
    mutationKey: signUpKeys.register(),
    mutationFn: registerAccount,
  });
