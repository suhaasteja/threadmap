import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this directory. Without this, Turbopack walks
  // upward looking for a lockfile and may pick up a stray one from the repo
  // root (where the Python project lives), then complain about ambiguity.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
