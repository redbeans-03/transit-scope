import type { NextConfig } from "next";

// GitHub Pages serves a project site from a subdirectory, so the build needs a
// base path. Both variables are set by .github/workflows/deploy.yml; locally
// they are unset and the app runs from the root as usual.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const staticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  // This repo documents itself in README.md; skip the generated agent rule files.
  agentRules: false,
  // Next blocks cross-origin requests for /_next/* dev assets by default, which
  // silently 403s every client chunk when the dev server is reached through a
  // tunnel, container port forward or any host other than the one it bound to.
  // Without this the page still renders but the charts never draw.
  allowedDevOrigins: ["localhost", "127.0.0.1", "0.0.0.0", "*.localhost"],
  // Every route is prerendered, so the dashboard can ship as plain static files.
  // Kept opt-in so that `next dev` and `next start` behave normally.
  ...(staticExport ? { output: "export" as const } : {}),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
