import { json, readJson } from "../lib/http.js";
import { listSchedule, upsertScheduleSlot, getLatestScheduleInfo } from "../lib/db/schedule.js";
import { getRotationData } from "../lib/db/rotation.js";
import { toWeekKey } from "../lib/date.js";

export async function handleGetSchedule(db) {
  const [slots, rotationData, latestInfo] = await Promise.all([
    listSchedule(db),
    getRotationData(db),
    getLatestScheduleInfo(db)
  ]);
  return json({
    slots,
    rotation: rotationData.rotation,
    latestDate: latestInfo.latestDate,
    latestPickerName: latestInfo.latestPickerName
  });
}

export async function handleUpsertScheduleSlot(request, db) {
  const body = await readJson(request);
  const existingWeekKey = String(body.weekKey || "").trim() || null;
  const watchDate = String(body.watchDate || "").trim();
  const pickerDisplayName = String(body.pickerDisplayName || "").trim() || null;

  if (!watchDate || !/^\d{4}-\d{2}-\d{2}$/.test(watchDate)) {
    return json({ error: "invalid_request", message: "watchDate must be a valid ISO date (YYYY-MM-DD)." }, 400);
  }

  if (!pickerDisplayName) {
    return json({ error: "invalid_request", message: "pickerDisplayName is required." }, 400);
  }

  const weekKey = toWeekKey(watchDate);

  await upsertScheduleSlot(db, { existingWeekKey, weekKey, watchDate, pickerDisplayName });
  const slots = await listSchedule(db);
  return json({ slots });
}
