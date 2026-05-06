import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAccessJwtAssertion, extractMemberFromAuth, requireAdmin } from "../../../src/lib/auth.js";
import { HttpError } from "../../../src/lib/http.js";

function makeRequest(headers = {}) {
  return new Request("http://localhost/", { headers });
}

function fakeJwt(claims) {
  const payload = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `header.${payload}.signature`;
}

function makeDb(memberRow) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => memberRow
      })
    })
  };
}

describe("getAccessJwtAssertion()", () => {
  it("returns the cf-access-jwt-assertion header value", () => {
    const req = makeRequest({ "cf-access-jwt-assertion": "tok123" });
    assert.equal(getAccessJwtAssertion(req), "tok123");
  });

  it("falls back to the CF_Authorization cookie", () => {
    const req = makeRequest({ cookie: "other=x; CF_Authorization=cookietok; foo=bar" });
    assert.equal(getAccessJwtAssertion(req), "cookietok");
  });

  it("returns null when neither header nor cookie is present", () => {
    const req = makeRequest();
    assert.equal(getAccessJwtAssertion(req), null);
  });

  it("returns null when cookie header is present but CF_Authorization is absent", () => {
    const req = makeRequest({ cookie: "session=abc" });
    assert.equal(getAccessJwtAssertion(req), null);
  });
});

describe("extractMemberFromAuth()", () => {
  it("throws 401 when no assertion and no DEV_AUTH_EMAIL", async () => {
    const req = makeRequest();
    await assert.rejects(() => extractMemberFromAuth(req, { DB: makeDb(null) }), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 401);
      return true;
    });
  });

  it("returns member when DEV_AUTH_EMAIL matches a seeded member", async () => {
    const member = { email: "dev@example.com", displayName: "Dev", isAdmin: 0, profileColor: "#fff", profileEmoji: "🎬" };
    const req = makeRequest();
    const result = await extractMemberFromAuth(req, { DEV_AUTH_EMAIL: "dev@example.com", DB: makeDb(member) });
    assert.equal(result.email, "dev@example.com");
  });

  it("throws 403 when DEV_AUTH_EMAIL does not match any member", async () => {
    const req = makeRequest();
    await assert.rejects(
      () => extractMemberFromAuth(req, { DEV_AUTH_EMAIL: "nobody@example.com", DB: makeDb(null) }),
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 403);
        assert.equal(err.code, "not_a_member");
        return true;
      }
    );
  });

  it("throws 401 for a malformed JWT (wrong number of parts)", async () => {
    const req = makeRequest({ "cf-access-jwt-assertion": "onlytwoparts.here" });
    await assert.rejects(() => extractMemberFromAuth(req, { DB: makeDb(null) }), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 401);
      return true;
    });
  });

  it("throws 401 when JWT payload is missing the email claim", async () => {
    const req = makeRequest({ "cf-access-jwt-assertion": fakeJwt({ sub: "no-email" }) });
    await assert.rejects(() => extractMemberFromAuth(req, { DB: makeDb(null) }), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 401);
      return true;
    });
  });

  it("throws 403 when email is valid but member is not in the DB", async () => {
    const req = makeRequest({ "cf-access-jwt-assertion": fakeJwt({ email: "unknown@example.com" }) });
    await assert.rejects(() => extractMemberFromAuth(req, { DB: makeDb(null) }), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 403);
      assert.equal(err.code, "not_a_member");
      return true;
    });
  });

  it("returns shaped member object on success", async () => {
    const row = { email: "a@b.com", displayName: "Alice", isAdmin: 1, profileColor: "#123456", profileEmoji: "🎥" };
    const req = makeRequest({ "cf-access-jwt-assertion": fakeJwt({ email: "a@b.com" }) });
    const result = await extractMemberFromAuth(req, { DB: makeDb(row) });
    assert.deepEqual(result, {
      email: "a@b.com",
      displayName: "Alice",
      isAdmin: true,
      profileColor: "#123456",
      profileEmoji: "🎥"
    });
  });
});

describe("requireAdmin()", () => {
  it("throws 403 when member is not an admin", async () => {
    const db = makeDb(null); // first() returns null → not found
    await assert.rejects(
      () => requireAdmin(db, { displayName: "Bob" }),
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 403);
        assert.equal(err.code, "forbidden");
        return true;
      }
    );
  });

  it("resolves without error when member is an admin", async () => {
    const db = makeDb({ 1: 1 }); // truthy row
    await assert.doesNotReject(() => requireAdmin(db, { displayName: "Alice" }));
  });
});
