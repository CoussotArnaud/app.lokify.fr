const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const defaultApiProxyTarget =
  process.env.NODE_ENV === "production"
    ? "https://api.app.lokify.fr/api"
    : "http://localhost:4000/api";

const apiProxyTarget = normalizeUrl(process.env.API_PROXY_TARGET || defaultApiProxyTarget);

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
