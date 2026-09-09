import assert from "node:assert/strict"
import test from "node:test"
import { mediaObjectId, resetPresignedUrlCache, reusePresignedUrl } from "./media-url.ts"

test("mediaObjectId uses s3Key and does not collapse studio/file URLs", () => {
  assert.equal(mediaObjectId("https://cdn.example/a.png?sig=1", "look/1.png"), "s3:look/1.png")
  assert.equal(
    mediaObjectId("https://api.example/internal/studio/file?s3Key=look%2F1.png"),
    "s3:look/1.png",
  )
  assert.notEqual(
    mediaObjectId("https://api.example/internal/studio/file?s3Key=a"),
    mediaObjectId("https://api.example/internal/studio/file?s3Key=b"),
  )
})

test("reusePresignedUrl keeps the first URL while the object identity is unchanged", () => {
  resetPresignedUrlCache()
  const first = reusePresignedUrl("look:1", "https://s3.example/look/1.png?sig=old", "look/1.png")
  const second = reusePresignedUrl("look:1", "https://s3.example/look/1.png?sig=new", "look/1.png")
  assert.equal(first, "https://s3.example/look/1.png?sig=old")
  assert.equal(second, first)
})

test("reusePresignedUrl replaces the URL when s3Key changes", () => {
  resetPresignedUrlCache()
  reusePresignedUrl("look:1", "https://s3.example/a.png?sig=1", "a.png")
  const next = reusePresignedUrl("look:1", "https://s3.example/b.png?sig=2", "b.png")
  assert.equal(next, "https://s3.example/b.png?sig=2")
})
