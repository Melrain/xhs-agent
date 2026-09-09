import assert from "node:assert/strict"
import test from "node:test"
import { consumeSseBuffer } from "./sse.ts"

test("consumeSseBuffer parses named events and keeps a partial tail", () => {
  const first = consumeSseBuffer("event: look.updated\ndata: {\"lookId\":\"1\"}\n\nevent: film.")
  assert.equal(first.frames.length, 1)
  assert.equal(first.frames[0]?.event, "look.updated")
  assert.equal(first.frames[0]?.data, "{\"lookId\":\"1\"}")
  assert.equal(first.rest, "event: film.")

  const second = consumeSseBuffer(`${first.rest}updated\ndata: {\"projectId\":\"p\"}\n\n`)
  assert.equal(second.frames[0]?.event, "film.updated")
  assert.equal(second.rest, "")
})

test("consumeSseBuffer ignores comments and heartbeats without data", () => {
  const parsed = consumeSseBuffer(": keep-alive\n\nevent: heartbeat\n\n")
  assert.deepEqual(parsed.frames, [])
})
