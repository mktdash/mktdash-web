import "server-only";

export interface ProxiedRequestLog {
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly service: string;
  readonly upstreamPath: string;
  readonly status: number;
  readonly durationMs: number;
  readonly problemCode?: string;
  readonly outcome?: "upstream-unreachable" | "session-expired" | "forbidden";
}

type LogLevel = "info" | "warn" | "error";

const APP_NAME = "mktdash-web-bff";

const levelForStatus = (status: number): LogLevel => {
  if (status >= 500) {
    return "error";
  }

  return status >= 400 ? "warn" : "info";
};

export const logProxiedRequest = (entry: ProxiedRequestLog): void => {
  const level = levelForStatus(entry.status);

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    app: APP_NAME,
    event: "bff.request",
    ...entry,
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
};
