import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapScreeningSummary } from "../../../../src/lib/db/screenings.js";

const baseRow = {
  weekKey: "2025-W10",
  watchDate: "2025-03-06",
  guestPickerName: null,
  notes: null,
  chooserName: "Alice",
  chooserColor: "#4A7C59",
  chooserEmoji: "🎬",
  imdbId: "tt1234567",
  title: "Test Film",
  year: "2024",
  runtime: "120 min",
  director: "Jane Smith",
  genre: "Drama",
  plot: "A story.",
  posterUrl: "https://example.com/poster.jpg",
  imdbRating: "7.5",
  imdbVotes: "10000",
  averageScore: "8.25",
  ratingCount: "3"
};

describe("mapScreeningSummary()", () => {
  it("maps all top-level fields", () => {
    const result = mapScreeningSummary(baseRow);
    assert.equal(result.weekKey, "2025-W10");
    assert.equal(result.watchDate, "2025-03-06");
    assert.equal(result.notes, null);
  });

  it("maps chooser from chooserName and profile fields", () => {
    const result = mapScreeningSummary(baseRow);
    assert.deepEqual(result.chooser, {
      name: "Alice",
      profileColor: "#4A7C59",
      profileEmoji: "🎬"
    });
  });

  it("falls back to guestPickerName when chooserName is absent", () => {
    const result = mapScreeningSummary({ ...baseRow, chooserName: null, guestPickerName: "Bob" });
    assert.equal(result.chooser.name, "Bob");
  });

  it("falls back to 'Guest' when both chooserName and guestPickerName are absent", () => {
    const result = mapScreeningSummary({ ...baseRow, chooserName: null, guestPickerName: null });
    assert.equal(result.chooser.name, "Guest");
  });

  it("maps film sub-object", () => {
    const result = mapScreeningSummary(baseRow);
    assert.deepEqual(result.film, {
      imdbId: "tt1234567",
      title: "Test Film",
      year: "2024",
      runtime: "120 min",
      director: "Jane Smith",
      genre: "Drama",
      plot: "A story.",
      posterUrl: "https://example.com/poster.jpg",
      imdbRating: "7.5",
      imdbVotes: "10000"
    });
  });

  it("coerces averageScore to a number", () => {
    const result = mapScreeningSummary(baseRow);
    assert.equal(result.averageScore, 8.25);
    assert.equal(typeof result.averageScore, "number");
  });

  it("preserves null averageScore as null", () => {
    const result = mapScreeningSummary({ ...baseRow, averageScore: null });
    assert.equal(result.averageScore, null);
  });

  it("coerces ratingCount to a number", () => {
    const result = mapScreeningSummary(baseRow);
    assert.equal(result.ratingCount, 3);
    assert.equal(typeof result.ratingCount, "number");
  });

  it("defaults ratingCount to 0 when absent", () => {
    const result = mapScreeningSummary({ ...baseRow, ratingCount: null });
    assert.equal(result.ratingCount, 0);
  });
});
