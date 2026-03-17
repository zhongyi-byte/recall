import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  security: {
    checkOrigin: false
  },
  adapter: cloudflare({
    imageService: "compile",
    inspectorPort: false
  }),
  vite: {
    plugins: [tailwindcss()]
  }
});
