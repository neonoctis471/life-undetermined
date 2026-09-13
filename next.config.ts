import type { NextConfig } from "next";

/*
 * Headers that cannot break anything here. Two are deliberately absent:
 * X-Frame-Options, because the event's showcase page may well embed the demo
 * in an iframe and a blank panel would cost more than the clickjacking it
 * prevents — there is no privileged action inside the page to steal a click
 * for; and a full Content-Security-Policy, which Next needs nonces to get
 * right and which turns a mistake into a blank page.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
