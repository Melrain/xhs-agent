import assert from "node:assert/strict"
import test from "node:test"
import {
  asLookCards,
  mergeCharacterCards,
  mergeLookList,
  pendingCharacterIdsFromLooks,
} from "./look-cache.ts"

test("asLookCards unwraps array, single card, and { looks } / { look }", () => {
  const card = { id: "l1", characterId: "c1", status: "pending" }
  assert.deepEqual(asLookCards([card]), [card])
  assert.deepEqual(asLookCards(card), [card])
  assert.deepEqual(asLookCards({ looks: [card] }), [card])
  assert.deepEqual(asLookCards({ look: card }), [card])
  assert.deepEqual(asLookCards({ ok: true }), [])
})

test("mergeLookList keeps optimistic pending that the refetch missed", () => {
  const pending = { id: "new", characterId: "c1", status: "pending" }
  const older = { id: "old", characterId: "c1", status: "ready" }
  const merged = mergeLookList(
    { looks: [pending, older], total: 2 },
    { looks: [older], total: 1 },
  )
  assert.equal(merged.looks[0]?.id, "new")
  assert.equal(merged.looks.length, 2)
  assert.equal(merged.total, 2)
})

test("mergeLookList lets the server win once it knows the look", () => {
  const pending = { id: "new", characterId: "c1", status: "pending" }
  const ready = { id: "new", characterId: "c1", status: "ready" }
  const merged = mergeLookList({ looks: [pending], total: 1 }, { looks: [ready], total: 1 })
  assert.equal(merged.looks[0]?.status, "ready")
  assert.equal(merged.looks.length, 1)
})

test("mergeCharacterCards keeps pendingCount while looks cache is still pending", () => {
  const previous = [{ id: "c1", lookCount: 3, pendingCount: 1 }]
  const incoming = [{ id: "c1", lookCount: 2, pendingCount: 0 }]
  const merged = mergeCharacterCards(previous, incoming, new Set(["c1"]))
  assert.equal(merged[0]?.pendingCount, 1)
  assert.equal(merged[0]?.lookCount, 3)
})

test("mergeCharacterCards drops pendingCount after looks are no longer pending", () => {
  const previous = [{ id: "c1", lookCount: 3, pendingCount: 1 }]
  const incoming = [{ id: "c1", lookCount: 3, pendingCount: 0 }]
  const merged = mergeCharacterCards(previous, incoming, new Set())
  assert.equal(merged[0]?.pendingCount, 0)
})

test("pendingCharacterIdsFromLooks reads pending rows", () => {
  const ids = pendingCharacterIdsFromLooks([
    {
      looks: [
        { id: "a", characterId: "c1", status: "pending" },
        { id: "b", characterId: "c2", status: "ready" },
      ],
      total: 2,
    },
  ])
  assert.deepEqual([...ids], ["c1"])
})
