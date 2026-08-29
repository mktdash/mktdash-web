import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { AUTH_ENDPOINTS, problemResponse } from "@/test/handlers/authHandlers";
import { server } from "@/test/handlers/server";
import {
  emailAlreadyRegisteredProblem,
  problemDetails,
  VERIFIED_EMAIL,
} from "@/test/fixtures/auth.fixtures";
import { renderWithProviders } from "@/test/utils/renderWithProviders";
import SignUpForm from "./SignUpForm";

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

const PASSWORD = "correct horse battery staple";

const completeAccountStep = async (
  user: ReturnType<typeof renderWithProviders>["user"],
) => {
  await user.type(screen.getByLabelText("Full name"), "Priya Raman");
  await user.type(screen.getByLabelText("Work email"), VERIFIED_EMAIL);
  await user.type(screen.getByLabelText("Password"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "Continue" }));
};

const completeWorkspaceStep = async (
  user: ReturnType<typeof renderWithProviders>["user"],
) => {
  await user.type(await screen.findByLabelText("Workspace name"), "Acme Co.");
  await user.click(screen.getByRole("button", { name: "Create workspace" }));
};

describe("SignUpForm", () => {
  afterEach(() => {
    replace.mockReset();
  });

  it("sends the operator to verify their email once registration is accepted", async () => {
    const { user } = renderWithProviders(<SignUpForm />);

    await completeAccountStep(user);
    await completeWorkspaceStep(user);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        `/verify-email?email=${encodeURIComponent(VERIFIED_EMAIL)}`,
      );
    });
  });

  it("submits exactly the fields the strict upstream schema accepts", async () => {
    const bodies: unknown[] = [];

    server.use(
      http.post(AUTH_ENDPOINTS.signUp, async ({ request }) => {
        bodies.push(await request.json());

        return HttpResponse.json(
          {
            status: "verification-required",
            email: VERIFIED_EMAIL,
            expiresInSeconds: 900,
            resendAvailableInSeconds: 60,
          },
          { status: 202 },
        );
      }),
    );

    const { user } = renderWithProviders(<SignUpForm />);

    await completeAccountStep(user);
    await completeWorkspaceStep(user);

    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });

    expect(bodies[0]).toEqual({
      fullName: "Priya Raman",
      email: VERIFIED_EMAIL,
      password: PASSWORD,
      workspaceName: "Acme Co.",
      tenancy: "company",
    });
  });

  it("returns to the account step when the email is already registered", async () => {
    server.use(
      http.post(AUTH_ENDPOINTS.signUp, () =>
        problemResponse(emailAlreadyRegisteredProblem),
      ),
    );

    const { user } = renderWithProviders(<SignUpForm />);

    await completeAccountStep(user);
    await completeWorkspaceStep(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /an account already exists for that email address/i,
    );
    expect(await screen.findByLabelText("Work email")).toHaveValue(
      VERIFIED_EMAIL,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a server field rejection on the field the service named", async () => {
    server.use(
      http.post(AUTH_ENDPOINTS.signUp, () =>
        problemResponse(
          problemDetails({
            status: 400,
            code: "validation_failed",
            title: "Validation failed",
            detail: "One or more fields were rejected.",
            errors: [
              { path: "password", message: "Use at least 12 characters" },
            ],
          }),
        ),
      ),
    );

    const { user } = renderWithProviders(<SignUpForm />);

    await completeAccountStep(user);
    await completeWorkspaceStep(user);

    expect(
      await screen.findByText(/use at least 12 characters/i),
    ).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });

  it("surfaces an unreachable service rather than a silent failure", async () => {
    server.use(http.post(AUTH_ENDPOINTS.signUp, () => HttpResponse.error()));

    const { user } = renderWithProviders(<SignUpForm />);

    await completeAccountStep(user);
    await completeWorkspaceStep(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach the sign-up service/i,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithProviders(<SignUpForm />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
