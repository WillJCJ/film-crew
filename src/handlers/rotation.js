import { json, readJson } from "../lib/http.js";
import { getRotationData } from "../lib/db/rotation.js";

export async function handleGetRotation(db) {
  return json(await getRotationData(db));
}

export async function handleUpdateScreeningDay(request, db) {
  const body = await readJson(request);
  const day = Number(body.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return json({ error: "invalid_request", message: "day must be 0 (Sunday) to 6 (Saturday)." }, 400);
  }
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('screening_day', ?)").bind(String(day)).run();
  return json({ screeningDayOfWeek: day });
}

export async function handleUpdateRotation(request, db) {
  const body = await readJson(request);
  if (!Array.isArray(body.order)) {
    return json({ error: "invalid_request", message: "order must be an array of display names." }, 400);
  }
  await db.prepare("UPDATE members SET rotation_order = NULL").run();
  for (let i = 0; i < body.order.length; i++) {
    await db.prepare("UPDATE members SET rotation_order = ? WHERE display_name = ?")
      .bind(i, String(body.order[i]))
      .run();
  }
  return json(await getRotationData(db));
}
