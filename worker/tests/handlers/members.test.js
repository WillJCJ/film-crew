import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleUpdateOwnProfile, handleAdminUpdateMemberProfile } from "../../../src/handlers/members.js";
import { HttpError } from "../../../src/lib/http.js";

function makeRequest(body) {
  return new Request("http://localhost/", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

function makeDb({ changes = 1, updatedRow = null } = {}) {
  return {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ meta: { changes } }),
        first: async () => updatedRow
      })
    })
  };
}

const validProfile = { profileColor: "#4A7C59", profileEmoji: "🎬" };
const member = { displayName: "Alice", email: "a@b.com" };

describe("handleUpdateOwnProfile()", () => {
  it("returns updated member on valid input", async () => {
    const updatedRow = { email: "a@b.com", displayName: "Alice", isAdmin: 0, profileColor: "#4A7C59", profileEmoji: "🎬" };
    const res = await handleUpdateOwnProfile(makeRequest(validProfile), makeDb({ updatedRow }), member);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.member.displayName, "Alice");
  });

  it("throws HttpError(400) for an invalid hex color", async () => {
    await assert.rejects(
      () => handleUpdateOwnProfile(makeRequest({ profileColor: "notacolor", profileEmoji: "🎬" }), makeDb(), member),
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal(err.code, "invalid_request");
        return true;
      }
    );
  });

  it("throws HttpError(400) when profileEmoji is plain text", async () => {
    await assert.rejects(
      () => handleUpdateOwnProfile(makeRequest({ profileColor: "#4A7C59", profileEmoji: "abc" }), makeDb(), member),
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  it("throws HttpError(400) when profileEmoji is multiple characters", async () => {
    await assert.rejects(
      () => handleUpdateOwnProfile(makeRequest({ profileColor: "#4A7C59", profileEmoji: "🎬🎥" }), makeDb(), member),
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  it("upcases the hex color in the stored value", async () => {
    const updatedRow = { email: "a@b.com", displayName: "Alice", isAdmin: 0, profileColor: "#4A7C59", profileEmoji: "🎬" };
    const res = await handleUpdateOwnProfile(
      makeRequest({ profileColor: "#4a7c59", profileEmoji: "🎬" }),
      makeDb({ updatedRow }),
      member
    );
    assert.equal(res.status, 200);
  });

  it("accepts a valid telegram username", async () => {
    const updatedRow = { email: "a@b.com", displayName: "Alice", isAdmin: 0, profileColor: "#4A7C59", profileEmoji: "🎬", telegramUsername: "alice_crew" };
    const res = await handleUpdateOwnProfile(
      makeRequest({ ...validProfile, telegramUsername: "alice_crew" }),
      makeDb({ updatedRow }),
      member
    );
    assert.equal(res.status, 200);
  });

  it("strips leading @ from telegram username", async () => {
    const updatedRow = { email: "a@b.com", displayName: "Alice", isAdmin: 0, profileColor: "#4A7C59", profileEmoji: "🎬", telegramUsername: "alice_crew" };
    const res = await handleUpdateOwnProfile(
      makeRequest({ ...validProfile, telegramUsername: "@alice_crew" }),
      makeDb({ updatedRow }),
      member
    );
    assert.equal(res.status, 200);
  });

  it("throws HttpError(400) when telegramUsername is too short", async () => {
    await assert.rejects(
      () => handleUpdateOwnProfile(makeRequest({ ...validProfile, telegramUsername: "ab" }), makeDb(), member),
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal(err.code, "invalid_request");
        return true;
      }
    );
  });

  it("throws HttpError(400) when telegramUsername contains invalid characters", async () => {
    await assert.rejects(
      () => handleUpdateOwnProfile(makeRequest({ ...validProfile, telegramUsername: "alice crew!" }), makeDb(), member),
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  it("accepts empty string to clear telegram username", async () => {
    const updatedRow = { email: "a@b.com", displayName: "Alice", isAdmin: 0, profileColor: "#4A7C59", profileEmoji: "🎬", telegramUsername: null };
    const res = await handleUpdateOwnProfile(
      makeRequest({ ...validProfile, telegramUsername: "" }),
      makeDb({ updatedRow }),
      member
    );
    assert.equal(res.status, 200);
  });
});

describe("handleAdminUpdateMemberProfile()", () => {
  it("returns 400 when displayName is missing", async () => {
    const res = await handleAdminUpdateMemberProfile(makeRequest({ ...validProfile }), makeDb());
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "invalid_request");
  });

  it("returns 404 when the target member does not exist", async () => {
    const res = await handleAdminUpdateMemberProfile(
      makeRequest({ displayName: "Nobody", ...validProfile }),
      makeDb({ updatedRow: null })
    );
    assert.equal(res.status, 404);
  });

  it("returns updated member when input is valid", async () => {
    const updatedRow = { email: "b@c.com", displayName: "Bob", isAdmin: 0, profileColor: "#4A7C59", profileEmoji: "🎬" };
    const res = await handleAdminUpdateMemberProfile(
      makeRequest({ displayName: "Bob", ...validProfile }),
      makeDb({ updatedRow })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.member.displayName, "Bob");
  });
});
