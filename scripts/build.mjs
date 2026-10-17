import { build } from "esbuild-wasm";
import { mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/plugin.ts"],
  outfile: "dist/plugin.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  minify: true,
  packages: "external",
});

console.log("TokenPulse AI plugin built successfully.");
