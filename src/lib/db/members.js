import { HttpError } from "../http.js";

export async function getMemberByEmail(db, email) {
  return db
    .prepare(
      `SELECT email, display_name AS displayName, is_admin AS isAdmin,
              profile_color AS profileColor, profile_emoji AS profileEmoji,
              telegram_username AS telegramUsername
       FROM members WHERE email = ? LIMIT 1`
    )
    .bind(email)
    .first();
}

export async function getMemberByDisplayName(db, displayName) {
  return db
    .prepare(
      `SELECT email, display_name AS displayName, is_admin AS isAdmin,
              profile_color AS profileColor, profile_emoji AS profileEmoji,
              telegram_username AS telegramUsername
       FROM members WHERE display_name = ? LIMIT 1`
    )
    .bind(displayName)
    .first();
}

export async function listMembers(db) {
  const result = await db
    .prepare(
      `SELECT email, display_name AS displayName, is_admin AS isAdmin,
              profile_color AS profileColor, profile_emoji AS profileEmoji,
              telegram_username AS telegramUsername,
              rotation_order AS rotationOrder
       FROM members ORDER BY display_name ASC`
    )
    .all();

  return result.results || [];
}

export async function updateMemberProfile(db, displayName, profile) {
  const result = await db
    .prepare(
      `UPDATE members
       SET profile_color = ?, profile_emoji = ?, telegram_username = ?, updated_at = CURRENT_TIMESTAMP
       WHERE display_name = ?`
    )
    .bind(profile.profileColor, profile.profileEmoji, profile.telegramUsername ?? null, displayName)
    .run();

  if (Number(result.meta?.changes || 0) === 0) {
    throw new HttpError(404, "Member not found.", "not_found");
  }
}
