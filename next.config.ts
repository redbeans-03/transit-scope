import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo documents itself in README.md; skip the generated agent rule files.
  agentRules: false,
  // Next blocks cross-origin requests for /_next/* dev assets by default, which
  // silently 403s every client chunk when the dev server is reached through a
  // tunnel, container port forward or any host other than the one it bound to.
  // Without this the page still renders but the charts never draw.
  allowedDevOrigins: ["localhost", "127.0.0.1", "0.0.0.0", "*.localhost"],
};

export default nextConfig;
