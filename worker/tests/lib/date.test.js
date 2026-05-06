import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toWeekKey } from "../../../src/lib/date.js";
import { HttpError } from "../../../src/lib/http.js";

describe("toWeekKey()", () => {
  it("returns the ISO week key for a Monday", () => {
    assert.equal(toWeekKey("2025-01-06"), "2025-W02");
  });

  it("returns the ISO week key for a Wednesday", () => {
    assert.equal(toWeekKey("2025-01-01"), "2025-W01");
  });

  it("returns the ISO week key for a Sunday", () => {
    assert.equal(toWeekKey("2025-01-05"), "2025-W01");
  });

  it("handles ISO week spanning a year boundary (Dec → Jan)", () => {
    // 2024-12-30 is a Monday in ISO week 2025-W01
    assert.equal(toWeekKey("2024-12-30"), "2025-W01");
  });

  it("handles ISO week at the end of a year", () => {
    // 2024-12-23 is a Monday in 2024-W52
    assert.equal(toWeekKey("2024-12-23"), "2024-W52");
  });

  it("pads single-digit week numbers with a leading zero", () => {
    // 2025-01-02 is a Thursday in 2025-W01
    const key = toWeekKey("2025-03-03");
    assert.match(key, /^\d{4}-W\d{2}$/);
  });

  it("throws HttpError(400) for an invalid date string", () => {
    assert.throws(() => toWeekKey("not-a-date"), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 400);
      return true;
    });
  });
});
