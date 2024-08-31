import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        main: "./src/index.ts",
        miniflare: {
          compatibilityDate: "2022-10-31",
          compatibilityFlags: ["nodejs_compat"],
          kvNamespaces: ["FEED_ITEMS"],
        },
      },
    },
  },
});