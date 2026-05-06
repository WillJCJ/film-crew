import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HttpError, json, readJson } from "../../../src/lib/http.js";

describe("HttpError", () => {
  it("stores status, message and code", () => {
    const err = new HttpError(404, "Not found.", "not_found");
    assert.equal(err.status, 404);
    assert.equal(err.message, "Not found.");
    assert.equal(err.code, "not_found");
    assert.ok(err instanceof Error);
  });

  it("works without a code", () => {
    const err = new HttpError(500, "Oops.");
    assert.equal(err.code, undefined);
  });
});

describe("json()", () => {
  it("returns a 200 response by default", async () => {
    const res = json({ ok: true });
    assert.equal(res.status, 200);
  });

  it("returns the supplied status", async () => {
    const res = json({ error: "not_found" }, 404);
    assert.equal(res.status, 404);
  });

  it("sets content-type to application/json", () => {
    const res = json({});
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  });

  it("sets cache-control to no-store", () => {
    const res = json({});
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  it("serialises the payload as JSON", async () => {
    const res = json({ foo: "bar" });
    const body = await res.json();
    assert.deepEqual(body, { foo: "bar" });
  });
});

describe("readJson()", () => {
  it("parses a valid JSON body", async () => {
    const request = new Request("http://localhost/", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
      headers: { "content-type": "application/json" }
    });
    const body = await readJson(request);
    assert.deepEqual(body, { name: "test" });
  });

  it("throws HttpError(400) on invalid JSON", async () => {
    const request = new Request("http://localhost/", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" }
    });
    await assert.rejects(() => readJson(request), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 400);
      return true;
    });
  });
});
