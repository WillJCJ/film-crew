import { nextOccurrenceOfDay } from "../date.js";

export async function getRotationData(db) {
  const [rotationResult, settingRow, lastScreeningRow] = await Promise.all([
    db
      .prepare(
        `SELECT display_name AS displayName, profile_color AS profileColor,
                profile_emoji AS profileEmoji, rotation_order AS rotationOrder
         FROM members WHERE rotation_order IS NOT NULL ORDER BY rotation_order ASC`
      )
      .all(),
    db.prepare("SELECT value FROM settings WHERE key = 'screening_day'").first(),
    db
      .prepare(
        `SELECT chooser_member_id FROM weekly_screenings
         WHERE chooser_member_id IS NOT NULL ORDER BY week_key DESC LIMIT 1`
      )
      .first()
  ]);

  const rotation = rotationResult.results || [];
  const screeningDayOfWeek = Number(settingRow?.value ?? 4);
  const nextScreeningDate = nextOccurrenceOfDay(screeningDayOfWeek);

  let nextPicker = null;
  if (rotation.length > 0) {
    const lastPickerName = lastScreeningRow?.chooser_member_id || null;
    const lastIdx = lastPickerName ? rotation.findIndex((m) => m.displayName === lastPickerName) : -1;
    const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % rotation.length;
    nextPicker = rotation[nextIdx];
  }

  return { rotation, nextPicker, screeningDayOfWeek, nextScreeningDate };
}
