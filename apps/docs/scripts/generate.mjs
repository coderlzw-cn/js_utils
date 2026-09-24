import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Application, TSConfigReader } from "typedoc";

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(docsRoot, "../..");
const apiRoot = path.join(docsRoot, "content/docs/api");

const packages = [
  { name: "shared", title: "Shared", tsconfig: "packages/shared/tsconfig.json" },
  { name: "node", title: "Node", tsconfig: "packages/node/tsconfig.json" },
  { name: "browser", title: "Browser", tsconfig: "apps/docs/tsconfig.browser.json" },
];

async function listEntries(packageName) {
  const sourceDir = path.join(repoRoot, "packages", packageName, "src");
  const files = await readdir(sourceDir);
  return files.filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts")).map((file) => path.join(sourceDir, file));
}

async function addFrontmatter(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    if (entry.name === "meta.json" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pages.push(entry.name);
      continue;
    }
    if (!entry.name.endsWith(".md") && !entry.name.endsWith(".mdx")) continue;

    const text = await readFile(full, "utf8");
    if (!text.startsWith("---")) {
      const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
      const title = heading ?? entry.name.replace(/\.mdx?$/, "");
      await writeFile(full, `---\ntitle: ${JSON.stringify(title)}\n---\n\n${text}`);
    }
    pages.push(entry.name.replace(/\.mdx?$/, ""));
  }

  pages.sort((left, right) => (left === "index" ? -1 : right === "index" ? 1 : left.localeCompare(right)));
  await writeFile(path.join(dir, "meta.json"), `${JSON.stringify({ pages }, null, 2)}\n`);
}

async function generatePackage(item) {
  const output = path.join(apiRoot, item.name);
  await rm(output, { recursive: true, force: true });

  const app = await Application.bootstrapWithPlugins(
    {
      entryPoints: await listEntries(item.name),
      tsconfig: path.join(repoRoot, item.tsconfig),
      out: output,
      plugin: ["typedoc-plugin-markdown"],
      readme: "none",
      skipErrorChecking: true,
      excludePrivate: true,
      excludeInternal: true,
      githubPages: false,
      hideBreadcrumbs: true,
      hidePageHeader: true,
      entryFileName: "index",
      router: "module",
      membersWithOwnFile: [],
    },
    [new TSConfigReader()],
  );

  const project = await app.convert();
  if (!project) {
    throw new Error(`TypeDoc 无法解析 @utils/${item.name}`);
  }
  await app.generateOutputs(project);
  await addFrontmatter(output);
}

await rm(path.join(docsRoot, "api"), { recursive: true, force: true });
await Promise.all(packages.map((item) => generatePackage(item)));
await writeFile(path.join(apiRoot, "meta.json"), `${JSON.stringify({ title: "API", pages: packages.map((item) => item.name) }, null, 2)}\n`);
