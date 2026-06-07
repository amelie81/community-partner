import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Required for SharedArrayBuffer used by ONNX Runtime WASM multi-threading
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // credentialless allows cross-origin CDN assets without CORP headers
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
