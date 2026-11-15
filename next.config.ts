import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inventario en vivo: todas las vistas son dinámicas (ver `dynamic` en app/layout.tsx).
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
