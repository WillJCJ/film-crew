import { HttpError, json, readJson } from "../lib/http.js";
import { getMemberByDisplayName, updateMemberProfile } from "../lib/db/members.js";

function countGraphemes(value) {
  if (!value) {
    return 0;
  }

  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }

  return Array.from(value).length;
}

function isSingleEmoji(value) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || countGraphemes(trimmed) !== 1) {
    return false;
  }

  if (/[\p{L}]/u.test(trimmed)) {
    return false;
  }

  return /(\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(trimmed);
}

function parseProfileInput(body) {
  const rawColor = String(body.profileColor || "").trim();
  const rawEmoji = String(body.profileEmoji || "").trim();

  if (!/^#[0-9a-fA-F]{6}$/.test(rawColor)) {
    throw new HttpError(400, "profileColor must be a hex value like #4A7C59.", "invalid_request");
  }

  if (!isSingleEmoji(rawEmoji)) {
    throw new HttpError(400, "profileEmoji must be exactly one emoji, with no text.", "invalid_request");
  }

  return {
    profileColor: rawColor.toUpperCase(),
    profileEmoji: rawEmoji
  };
}

export async function handleUpdateOwnProfile(request, db, member) {
  const body = await readJson(request);
  const profile = parseProfileInput(body);

  await updateMemberProfile(db, member.displayName, profile);
  const refreshed = await getMemberByDisplayName(db, member.displayName);
  return json({ member: refreshed });
}

export async function handleAdminUpdateMemberProfile(request, db) {
  const body = await readJson(request);
  const displayName = String(body.displayName || "").trim();

  if (!displayName) {
    return json({ error: "invalid_request", message: "displayName is required." }, 400);
  }

  const profile = parseProfileInput(body);
  await updateMemberProfile(db, displayName, profile);

  const updated = await getMemberByDisplayName(db, displayName);
  if (!updated) {
    return json({ error: "not_found", message: "Member not found." }, 404);
  }

  return json({ member: updated });
}
