import axios, { type AxiosInstance } from "axios";
import { parseProblemDetails, type ProblemDetails } from "./problemDetails";

const BFF_BASE_URL = "/api";

export const httpClient: AxiosInstance = axios.create({
  baseURL: BFF_BASE_URL,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

export const extractProblemDetails = (
  error: unknown,
): ProblemDetails | null => {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  return parseProblemDetails(error.response?.data);
};

export const extractResponseStatus = (error: unknown): number | null => {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  return error.response?.status ?? null;
};

export const extractRetryAfterSeconds = (error: unknown): number | null => {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const header = error.response?.headers["retry-after"];
  const seconds = Number(header);

  return Number.isFinite(seconds) && seconds > 0 ? Math.trunc(seconds) : null;
};
