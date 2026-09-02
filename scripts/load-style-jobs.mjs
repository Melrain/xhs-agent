import { createRequire } from "node:module"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

export async function loadStyleJobs() {
  const require = createRequire(join(root, "node_modules/vite/package.json"))
  const esbuild = require("esbuild")
  const outDir = await mkdtemp(join(tmpdir(), "style-jobs-"))
  const outfile = join(outDir, "print-style-jobs.mjs")
  try {
    await esbuild.build({
      entryPoints: [join(root, "scripts/print-style-jobs.ts")],
      bundle: true,
      outfile,
      platform: "node",
      format: "esm",
      alias: { "@": join(root, "src") },
    })
    const mod = await import(pathToFileURL(outfile).href)
    if (!Array.isArray(mod.jobs) || mod.jobs.length === 0) {
      throw new Error("没有读到带预览的模板")
    }
    const groups = (process.env.PREVIEW_GROUPS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    const jobs =
      groups.length === 0
        ? mod.jobs
        : mod.jobs.filter((job) => groups.includes(job.group))
    if (jobs.length === 0) throw new Error("没有匹配的预览任务")
    return jobs
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}
