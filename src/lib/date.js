import { HttpError } from "./http.js";

export function nextOccurrenceOfDay(dayOfWeek) {
  const now = new Date();
  const todayDay = now.getUTCDay();
  let daysUntil = (dayOfWeek - todayDay + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil);
  return new Date(ms).toISOString().slice(0, 10);
}

export function toWeekKey(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "Watch date must be a valid ISO date.");
  }

  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((normalized - yearStart) / 86400000) + 1) / 7);
  return `${normalized.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}
