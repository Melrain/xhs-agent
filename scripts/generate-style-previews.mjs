#!/usr/bin/env node
/**
 * 用本机 grok.com 订阅出模板效果图。
 * 提示词从 src/lib/recruit-prompt-templates.ts 读。
 * 可用 PREVIEW_GROUPS=scene,copy 只出某几组。
 * 强制清掉 XAI_API_KEY / MEDIA_API_KEY，避免误走 console key。
 */
import { spawn } from "node:child_process"
import { mkdir, writeFile, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { loadStyleJobs } from "./load-style-jobs.mjs"
import { VARIANTS } from "./style-preview-jobs.mjs"

const GROK = process.env.GROK_BIN || `${process.env.HOME}/.grok/bin/grok`
const OUT_DIR = process.env.PREVIEW_OUT_DIR || "/tmp/recruit-style-previews"
const CONCURRENCY = Number(process.env.PREVIEW_CONCURRENCY || 3)

const VARIANT_NOTE = [
  "",
  "同一套信息和风格，换一种构图与光影，不要复制上一张。",
]

function grokJobPrompt(imagePrompt, outPath, variantNote) {
  return [
    "Read the imagine skill. You must call the built-in image_gen tool once.",
    "Do not write HTML/CSS/code. Do not call any HTTP API. Do not use an API key.",
    "Use the grok.com subscription image_gen tool only.",
    "image_gen aspect_ratio must be 3:4.",
    variantNote ? `Variation: ${variantNote}` : "",
    "Use this prompt verbatim as the image_gen prompt:",
    "",
    imagePrompt,
    "",
    `After the image exists, copy it to ${outPath}`,
    "Reply with only that absolute path.",
  ]
    .filter(Boolean)
    .join("\n")
}

function runGrok(promptFile, cwd) {
  const env = { ...process.env }
  delete env.XAI_API_KEY
  delete env.MEDIA_API_KEY
  delete env.XAI_KEY

  return new Promise((resolve, reject) => {
    const child = spawn(
      GROK,
      [
        "--prompt-file",
        promptFile,
        "--reasoning-effort",
        "low",
        "--max-turns",
        "8",
        "--permission-mode",
        "bypassPermissions",
        "--disable-web-search",
        "--output-format",
        "json",
        "--cwd",
        cwd,
      ],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    )
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`grok exit ${code}: ${stderr.slice(0, 400) || stdout.slice(0, 400)}`))
    })
  })
}

async function fileReady(path) {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 10_000
  } catch {
    return false
  }
}

async function generateOne(job, index) {
  const name = `${job.id}-${String(index).padStart(2, "0")}`
  const outPath = join(OUT_DIR, job.id, `${String(index).padStart(2, "0")}.png`)
  if (await fileReady(outPath)) {
    console.log(`skip ${name}`)
    return outPath
  }
  await mkdir(dirname(outPath), { recursive: true })
  const promptFile = join(OUT_DIR, "jobs", `${name}.txt`)
  await mkdir(dirname(promptFile), { recursive: true })
  await writeFile(
    promptFile,
    grokJobPrompt(job.prompt, outPath, VARIANT_NOTE[index - 1] ?? VARIANT_NOTE[1]),
    "utf8",
  )
  console.log(`start ${name}`)
  await runGrok(promptFile, OUT_DIR)
  if (!(await fileReady(outPath))) {
    throw new Error(`${name} 没有写出有效图片`)
  }
  console.log(`done ${name}`)
  return outPath
}

async function pool(items, limit, worker) {
  const pending = [...items]
  const running = new Set()
  const errors = []
  async function pump() {
    while (pending.length > 0) {
      const item = pending.shift()
      const task = worker(item)
        .catch((error) => {
          errors.push(error)
          console.error(error instanceof Error ? error.message : error)
        })
        .finally(() => running.delete(task))
      running.add(task)
      if (running.size >= limit) await Promise.race(running)
    }
    await Promise.all([...running])
  }
  await pump()
  if (errors.length) {
    throw new Error(`${errors.length} 个任务失败`)
  }
}

const jobs = await loadStyleJobs()
const queue = jobs.flatMap((job) =>
  Array.from({ length: VARIANTS }, (_, i) => ({ job, index: i + 1 })),
)

await pool(queue, CONCURRENCY, ({ job, index }) => generateOne(job, index))
console.log("all previews ready")
