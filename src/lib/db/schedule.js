export async function listSchedule(db) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db
    .prepare(
      `SELECT ws.week_key AS weekKey, ws.watch_date AS watchDate, ws.chooser_member_id AS pickerDisplayName,
              f.title AS filmTitle
       FROM weekly_screenings ws
       LEFT JOIN films f ON f.id = ws.film_id
       WHERE ws.watch_date >= ?
       ORDER BY ws.watch_date ASC`
    )
    .bind(today)
    .all();
  return result.results || [];
}

export async function upsertScheduleSlot(db, { existingWeekKey, weekKey, watchDate, pickerDisplayName }) {
  if (existingWeekKey) {
    await db
      .prepare(
        `UPDATE weekly_screenings
         SET week_key = ?, watch_date = ?, chooser_member_id = ?, guest_picker_name = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE week_key = ?`
      )
      .bind(weekKey, watchDate, pickerDisplayName || null, existingWeekKey)
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO weekly_screenings (
         week_key, watch_date, chooser_member_id, guest_picker_name, film_id, notes, updated_at
       ) VALUES (?, ?, ?, NULL, NULL, NULL, CURRENT_TIMESTAMP)`
    )
    .bind(weekKey, watchDate, pickerDisplayName || null)
    .run();
}

export async function getLatestScheduleInfo(db) {
  const screeningRow = await db
    .prepare(
      `SELECT watch_date, chooser_member_id FROM weekly_screenings
       WHERE watch_date IS NOT NULL ORDER BY watch_date DESC LIMIT 1`
    )
    .first();

  return {
    latestDate: screeningRow?.watch_date || null,
    latestPickerName: screeningRow?.chooser_member_id || null
  };
}
