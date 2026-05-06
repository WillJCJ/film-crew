import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleDeleteOwnRating } from "../../../src/handlers/screenings.js";

function makeEnv({ screeningExists = true } = {}) {
  const calls = [];
  const env = {
    DB: {
      prepare: (sql) => ({
        bind: (...params) => {
          calls.push({ sql, params });
          return {
            first: async () => {
              if (sql.includes("SELECT week_key FROM weekly_screenings")) {
                return screeningExists ? { week_key: params[0] } : null;
              }
              if (sql.includes("SELECT * FROM v_screening_summary")) {
                return {
                  weekKey: params[0],
                  watchDate: "2024-10-11",
                  notes: null,
                  averageScore: null,
                  ratingCount: 0,
                  chooserName: "Alice",
                  guestPickerName: null,
                  chooserColor: "#3E8F3B",
                  chooserEmoji: "🎬",
                  filmTitle: "Test Film",
                  year: "2024",
                  imdbId: "tt1234567",
                  posterUrl: null,
                  plot: null,
                  runtime: null,
                  genre: null,
                  director: null,
                  imdbRating: null,
                  imdbVotes: null,
                  response: "True"
                };
              }
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 1 } })
          };
        }
      })
    }
  };

  return { env, calls };
}

describe("handleDeleteOwnRating()", () => {
  it("returns 404 when screening does not exist", async () => {
    const { env } = makeEnv({ screeningExists: false });
    const member = { displayName: "Alice" };

    const res = await handleDeleteOwnRating(env, member, "2024-W41");
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "not_found");
  });

  it("deletes only the current member rating for the screening", async () => {
    const { env, calls } = makeEnv({ screeningExists: true });
    const member = { displayName: "Alice" };

    const res = await handleDeleteOwnRating(env, member, "2024-W41");
    assert.equal(res.status, 200);

    const deleteCall = calls.find((call) => call.sql.includes("DELETE FROM ratings"));
    assert.ok(deleteCall);
    assert.deepEqual(deleteCall.params, ["2024-W41", "Alice"]);
  });

  it("returns updated screening payload", async () => {
    const { env } = makeEnv({ screeningExists: true });
    const member = { displayName: "Alice" };

    const res = await handleDeleteOwnRating(env, member, "2024-W41");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.screening.weekKey, "2024-W41");
    assert.equal(Array.isArray(body.screening.ratings), true);
  });
});
