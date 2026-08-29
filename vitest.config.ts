import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    env: {
      API_GATEWAY_URL: "http://127.0.0.1:8080",
      SESSION_SECRET: "ZIFsFmMRAdAOAN8d2LExJGDErC/LczJQWU+HBAeYE9A=",
    },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "tests/e2e/**"],
    restoreMocks: true,
  },
});
