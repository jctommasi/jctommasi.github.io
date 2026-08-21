// @ts-check
import { defineConfig } from "astro/config";

// User page served from the domain root — no sub-path rewriting (manual §11.2).
// EN is the default locale at `/`; ES lives at `/es/` (manual §10).
export default defineConfig({
  site: "https://jctommasi.github.io",
  base: "/",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
