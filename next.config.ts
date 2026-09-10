import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Keep dev and production output apart. The login agent serves a production
  // build while `npm run dev` may be running at the same time; sharing one
  // directory lets each corrupt the other's build.
  distDir: process.env.NODE_ENV === "production" ? ".next-prod" : ".next",
};

export default config;
