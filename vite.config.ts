import { defineConfig } from "vite";
import solid from "@solidjs/start/vite";

export default defineConfig({
  plugins: [
    solid({
      preset: "static"
    })
  ]
});
