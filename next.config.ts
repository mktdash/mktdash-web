import type { NextConfig } from "next";
import path from "node:path";
import "./src/shared/config/env";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
