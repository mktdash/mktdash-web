import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { AUTH_ENDPOINTS, problemResponse } from "@/test/handlers/authHandlers";
import { server } from "@/test/handlers/server";
import {
  problemDetails,
  rateLimitedProblem,
  VERIFICATION_CODE,
  VERIFIED_EMAIL,
  verifiedResponse,
} from "@/test/fixtures/auth.fixtures";
import { renderWithProviders } from "@/test/utils/renderWithProviders";
import VerifyEmailForm from "./VerifyEmailForm";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const renderForm = () =>
  renderWithProviders(<VerifyEmailForm email={VERIFIED_EMAIL} />);

const codeField = (): HTMLElement =>
  screen.getByLabelText(/6-digit verification code/i);

const confirmButton = (): HTMLElement =>
  screen.getByRole("button", { name: /confirm email/i });

describe("VerifyEmailForm", () => {
  afterEach(() => {
    replace.mockReset();
  });

  it("starts a session and lands the operator on their workspace home", async () => {
    const { user } = renderForm();

    await user.type(codeField(), VERIFICATION_CODE);
    await user.click(confirmButton());

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(verifiedResponse.redirectTo);
    });
  });

  it("waits for the confirm button rather than verifying on the last digit", async () => {
    const { user } = renderForm();

    await user.type(codeField(), VERIFICATION_CODE);

    expect(replace).not.toHaveBeenCalled();
    expect(codeField()).toHaveValue(VERIFICATION_CODE);
  });

  it("explains an incorrect code and clears the boxes to retry", async () => {
    const { user } = renderForm();

    await user.type(codeField(), "111111");
    await user.click(confirmButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /that code is not right/i,
    );
    expect(codeField()).toHaveValue("");
    expect(replace).not.toHaveBeenCalled();
  });

  it("tells the operator to request a fresh code once one has expired", async () => {
    server.use(
      http.post(AUTH_ENDPOINTS.verifyEmail, () =>
        problemResponse(
          problemDetails({
            status: 410,
            code: "verification_code_expired",
            title: "Verification code expired",
            detail: "That code has expired. Request a new one and try again.",
          }),
        ),
      ),
    );

    const { user } = renderForm();

    await user.type(codeField(), VERIFICATION_CODE);
    await user.click(confirmButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /that code has expired/i,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("surfaces an unreachable service instead of failing silently", async () => {
    server.use(
      http.post(AUTH_ENDPOINTS.verifyEmail, () => HttpResponse.error()),
    );

    const { user } = renderForm();

    await user.type(codeField(), VERIFICATION_CODE);
    await user.click(confirmButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach the verification service/i,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("owns a server-side failure instead of blaming the operator's connection", async () => {
    const problem = problemDetails({
      status: 500,
      code: "internal_error",
      title: "Internal server error",
      detail: "Something went wrong. Quote the requestId when reporting this.",
    });

    server.use(
      http.post(AUTH_ENDPOINTS.verifyEmail, () => problemResponse(problem)),
    );

    const { user } = renderForm();

    await user.type(codeField(), VERIFICATION_CODE);
    await user.click(confirmButton());

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent(/something went wrong on our side/i);
    expect(alert).not.toHaveTextContent(/check your connection/i);
    expect(alert).toHaveTextContent(new RegExp(problem.requestId ?? "", "i"));
    expect(codeField()).toHaveValue(VERIFICATION_CODE);
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends the operator to sign in when the address verified but the session did not start", async () => {
    server.use(
      http.post(AUTH_ENDPOINTS.verifyEmail, () =>
        problemResponse(
          problemDetails({
            status: 502,
            code: "session_not_established",
            title: "Unexpected verification response",
            detail:
              "Your email was confirmed but we could not start your session. Try signing in.",
          }),
        ),
      ),
    );

    const { user } = renderForm();

    await user.type(codeField(), VERIFICATION_CODE);
    await user.click(confirmButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /your email is confirmed, but we could not start your session/i,
    );
    expect(
      screen.getByRole("link", { name: /go to sign in/i }),
    ).toHaveAttribute("href", "/login");
    expect(replace).not.toHaveBeenCalled();
  });

  it("asks for the full code before it will submit a partial one", async () => {
    const { user } = renderForm();

    await user.type(codeField(), "123");
    await user.click(confirmButton());

    expect(
      await screen.findByText(/enter the 6-digit code from your email/i),
    ).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores non-numeric input rather than accepting it", async () => {
    const { user } = renderForm();

    await user.type(codeField(), "abcdef");

    expect(codeField()).toHaveValue("");
  });

  it("holds the resend control on the cooldown the service returns", async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole("button", { name: /resend code/i }));

    const resendButton = await screen.findByRole("button", {
      name: /resend in 1:00/i,
    });

    expect(resendButton).toBeDisabled();
    expect(
      screen.getByText(
        new RegExp(`a new code is on its way to ${VERIFIED_EMAIL}`, "i"),
      ),
    ).toBeVisible();
  });

  it("holds resend on the cooldown the service dictates when rate limited", async () => {
    server.use(
      http.post(AUTH_ENDPOINTS.resendVerification, () =>
        problemResponse(rateLimitedProblem, { "retry-after": "45" }),
      ),
    );

    const { user } = renderForm();

    await user.click(screen.getByRole("button", { name: /resend code/i }));

    expect(
      await screen.findByRole("button", { name: /resend in 0:45/i }),
    ).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /a code was sent very recently/i,
    );
  });

  it("has no accessibility violations", async () => {
    const { container } = renderForm();

    expect(await axe(container)).toHaveNoViolations();
  });
});
