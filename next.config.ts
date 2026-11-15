import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remisión firmada (prueba de entrega) hasta 2 MB + margen del multipart
  experimental: { serverActions: { bodySizeLimit: "2.5mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
