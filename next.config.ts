import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // grammy, googleapis, form-data, and the Gemini SDK rely on Node-only APIs
  // and should not be bundled for the serverless/edge runtime.
  serverExternalPackages: ["grammy", "@google/generative-ai", "googleapis", "form-data"],
  typescript: {
    // `npm exec tsc --noEmit` is run separately in CI/validation; skip the
    // in-build type check here to avoid OOM crashes on memory-constrained
    // sandboxes with this large codebase.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
