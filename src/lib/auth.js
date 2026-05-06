import { HttpError } from "./http.js";
import { getMemberByEmail } from "./db/members.js";

export function getAccessJwtAssertion(request) {
  const headerAssertion = request.headers.get("cf-access-jwt-assertion");
  if (headerAssertion) {
    return headerAssertion;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === "CF_Authorization") {
      return rawValue.join("=") || null;
    }
  }

  return null;
}

export async function extractMemberFromAuth(request, env) {
  const assertion = getAccessJwtAssertion(request);
  if (!assertion) {
    const devEmail = String(env.DEV_AUTH_EMAIL || "").trim();
    if (devEmail) {
      const member = await getMemberByEmail(env.DB, devEmail);
      if (!member) {
        throw new HttpError(403, "DEV_AUTH_EMAIL does not match a seeded member.", "not_a_member");
      }
      return member;
    }

    throw new HttpError(401, "Cloudflare One authentication required.", "unauthorized");
  }

  let claims;
  try {
    const parts = assertion.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    claims = JSON.parse(decoded);
  } catch {
    throw new HttpError(401, "Invalid authentication token.", "unauthorized");
  }

  const email = claims.email;
  if (!email) {
    throw new HttpError(401, "Token missing email claim.", "unauthorized");
  }

  const member = await getMemberByEmail(env.DB, email);
  if (!member) {
    throw new HttpError(403, "Member not found. Please contact an admin.", "not_a_member");
  }

  return {
    email: member.email,
    displayName: member.displayName,
    isAdmin: Boolean(member.isAdmin),
    profileColor: member.profileColor,
    profileEmoji: member.profileEmoji
  };
}

export async function requireAdmin(db, member) {
  const adminRow = await db
    .prepare("SELECT 1 FROM members WHERE display_name = ? AND is_admin = 1 LIMIT 1")
    .bind(member.displayName)
    .first();

  if (!adminRow) {
    throw new HttpError(403, "Admin access required.", "forbidden");
  }
}
