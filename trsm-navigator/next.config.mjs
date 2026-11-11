/** @type {import('next').NextConfig} */
// NEXT_PUBLIC_BASE_PATH lets the static export live under a sub-path (e.g. GitHub Pages: /trsm-indoor-navigator).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  basePath,
  assetPrefix: basePath || undefined,
};
export default nextConfig;
