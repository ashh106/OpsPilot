/**
 * Timezone utilities for OpsPilot.
 * Performs deterministic conversion between wall-clock business local times and UTC database instants.
 */

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

/**
 * Returns the date/time components of a UTC Date as rendered in a given IANA timezone.
 */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });

  const partMap: Record<string, string> = {};
  for (const p of formatter.formatToParts(date)) {
    partMap[p.type] = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const hourRaw = Number(partMap.hour ?? 0);
  const hour = hourRaw === 24 ? 0 : hourRaw;

  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour,
    minute: Number(partMap.minute),
    dayOfWeek: weekdayMap[partMap.weekday ?? "Sun"] ?? 0,
  };
}

/**
 * Parses a "YYYY-MM-DD" date and "HH:mm" time in a given IANA timezone into a UTC Date.
 * Handles DST shifts through iterative convergence.
 */
export function parseZonedTime(dateStr: string, timeStr: string, timeZone: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!dateMatch) {
    throw new Error(`Invalid date format "${dateStr}". Expected YYYY-MM-DD.`);
  }

  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());
  if (!timeMatch) {
    throw new Error(`Invalid time format "${timeStr}". Expected HH:mm (00:00 - 23:59).`);
  }

  const targetYear = Number(dateMatch[1]);
  const targetMonth = Number(dateMatch[2]);
  const targetDay = Number(dateMatch[3]);
  const targetHour = Number(timeMatch[1]);
  const targetMin = Number(timeMatch[2]);

  // Initial approximation treating local numbers as UTC
  let guessTime = Date.UTC(targetYear, targetMonth - 1, targetDay, targetHour, targetMin, 0, 0);

  // Converge to find exact UTC instant matching target wall-clock parts in the timezone
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(new Date(guessTime), timeZone);
    const localAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
      0,
    );
    const targetAsUtc = Date.UTC(
      targetYear,
      targetMonth - 1,
      targetDay,
      targetHour,
      targetMin,
      0,
      0,
    );
    const diff = targetAsUtc - localAsUtc;
    if (diff === 0) break;
    guessTime += diff;
  }

  return new Date(guessTime);
}

/**
 * Formats a UTC Date to "HH:mm" in the specified timezone.
 */
export function formatZonedTime(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Returns the day of week (0 = Sunday ... 6 = Saturday) for a "YYYY-MM-DD" date in a timezone.
 */
export function getWeekdayForDate(dateStr: string, timeZone: string): number {
  const noonUtc = parseZonedTime(dateStr, "12:00", timeZone);
  return getZonedParts(noonUtc, timeZone).dayOfWeek;
}

/**
 * Half-open interval overlap check: [startA, endA) overlaps [startB, endB)
 * iff startA < endB && endA > startB.
 */
export function isOverlapping(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
}
