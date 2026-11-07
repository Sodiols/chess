import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Browsers and crawlers that skip <link rel="icon"> still ask for /favicon.ico; serve the knight there too.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon" }];
  },
  // Vercel already redirects http → https; HSTS makes browsers skip the http hop entirely.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
