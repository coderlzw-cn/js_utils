import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/*.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "browser",
  target: "es2022",
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: false,
  noExternal: ["@utils/shared"],
});
