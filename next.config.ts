import type { NextConfig } from "next";
import path from "node:path";
import "./src/shared/config/env";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
