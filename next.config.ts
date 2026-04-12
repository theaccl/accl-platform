import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Playwright and some browsers use 127.0.0.1; Next 16 blocks cross-origin dev HMR without this. */
  allowedDevOrigins: ["127.0.0.1"],
  /* Route handlers use native Node require for stockfish package resolution. */
  serverExternalPackages: ["stockfish"],
};

export default nextConfig;
