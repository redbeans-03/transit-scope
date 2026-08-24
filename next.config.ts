import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo documents itself in README.md; skip the generated agent rule files.
  agentRules: false,
};

export default nextConfig;
