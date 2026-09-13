import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    /*
     * Author avatars on the experience cards. Served straight from Zhihu's CDN
     * rather than through the optimiser: they arrive at 50px already, so there
     * is nothing to optimise and no reason to spend the quota.
     */
    remotePatterns: [{ protocol: "https", hostname: "**.zhimg.com" }],
  },
};

export default nextConfig;
