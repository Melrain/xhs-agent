import assert from "node:assert/strict"
import test from "node:test"
import { parseFilmUpdatedEvent, parseUserEvent } from "./user-events-parse.ts"

test("parseUserEvent accepts JSON string and object", () => {
  const payload = {
    type: "look.updated",
    lookId: "l1",
    characterId: "c1",
    status: "ready",
    at: "2026-09-09T00:00:00.000Z",
  }
  assert.deepEqual(parseUserEvent(JSON.stringify(payload)), payload)
  assert.deepEqual(parseUserEvent(payload), payload)
})

test("parseUserEvent drops heartbeat and incomplete rows", () => {
  assert.equal(parseUserEvent({ type: "heartbeat" }), null)
  assert.equal(parseUserEvent({ type: "look.updated", lookId: "l1" }), null)
  assert.equal(parseUserEvent(""), null)
})

test("parseFilmUpdatedEvent only accepts analyzing|ready|failed", () => {
  const payload = {
    type: "film.updated",
    projectId: "p1",
    refId: "r1",
    status: "analyzing",
    at: "2026-09-09T00:00:00.000Z",
  }
  assert.deepEqual(parseFilmUpdatedEvent(payload), payload)
  assert.equal(parseFilmUpdatedEvent({ ...payload, status: "running" }), null)
})
