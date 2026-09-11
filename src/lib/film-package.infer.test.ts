import assert from "node:assert/strict"
import test from "node:test"
import { inferFilmNextActionId, type FilmPackage } from "./film-package.ts"

function pkg(partial: Partial<FilmPackage> = {}): FilmPackage {
  return {
    stages: [],
    references: [],
    breakdown: [],
    ...partial,
  }
}

test("failed reference stays on ingest even if nextAction is run_breakdown", () => {
  const id = inferFilmNextActionId({
    nextAction: { id: "run_breakdown", message: "可以拆解" },
    package: pkg({
      references: [
        {
          id: "r1",
          source: "url",
          status: "failed",
          url: "https://example.com/v",
        },
      ],
    }),
  })
  assert.equal(id, "ingest_reference")
})

test("pending reference stays on ingest even if nextAction is run_breakdown", () => {
  const id = inferFilmNextActionId({
    nextAction: { id: "run_breakdown", message: "可以拆解" },
    package: pkg({
      references: [{ id: "r1", source: "upload", status: "pending" }],
    }),
  })
  assert.equal(id, "ingest_reference")
})

test("ready reference honors run_breakdown nextAction", () => {
  const id = inferFilmNextActionId({
    nextAction: { id: "run_breakdown", message: "可以拆解" },
    package: pkg({
      references: [
        {
          id: "r1",
          source: "upload",
          status: "ready",
        },
      ],
    }),
  })
  assert.equal(id, "run_breakdown")
})

test("missing reference stays on ingest", () => {
  assert.equal(inferFilmNextActionId({ package: pkg() }), "ingest_reference")
})
