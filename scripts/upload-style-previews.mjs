#!/usr/bin/env node
/**
 * 把本机预览图上传到 R2。只读 S3_*，不读 MEDIA_API_KEY / XAI_API_KEY。
 */
import { createReadStream } from "node:fs"
import { createRequire } from "node:module"
import { readFile, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadStyleJobs } from "./load-style-jobs.mjs"
import { VARIANTS, previewS3Key } from "./style-preview-jobs.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const BACKEND_DIR =
  process.env.BACKEND_DIR || join(root, "../xhs_auto_project/xhs_backend")
const BACKEND_ENV = process.env.BACKEND_ENV || join(BACKEND_DIR, ".env")
const OUT_DIR = process.env.PREVIEW_OUT_DIR || "/tmp/recruit-style-previews"

const require = createRequire(join(BACKEND_DIR, "package.json"))
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3")

function parseEnv(text) {
  const out = {}
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    if (key === "MEDIA_API_KEY" || key === "XAI_API_KEY") continue
    out[key] = line.slice(eq + 1).trim()
  }
  return out
}

function required(env, key) {
  const value = env[key]?.trim()
  if (!value) throw new Error(`${key} 未配置`)
  return value
}

const env = parseEnv(await readFile(BACKEND_ENV, "utf8"))
const client = new S3Client({
  region: env.S3_REGION?.trim() || "auto",
  endpoint: required(env, "S3_ENDPOINT"),
  forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: required(env, "S3_ACCESS_KEY_ID"),
    secretAccessKey: required(env, "S3_SECRET_ACCESS_KEY"),
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
})
const bucket = required(env, "S3_BUCKET")
const jobs = await loadStyleJobs()

for (const job of jobs) {
  for (let index = 1; index <= VARIANTS; index++) {
    const filePath = join(OUT_DIR, job.id, `${String(index).padStart(2, "0")}.png`)
    const info = await stat(filePath)
    const key = previewS3Key(job.id, index)
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: "image/png",
        ContentLength: info.size,
      }),
    )
    console.log(`uploaded ${key} ${info.size}B`)
  }
}
console.log("r2 upload done")
