// Orders entered after midnight but before this hour still belong to the
// previous business day (shop closes at 12am but rings up until ~4am).
export const BUSINESS_DAY_CUTOFF_HOUR = 4

export function toDateStr(d: Date)  { return d.toLocaleDateString("sv") }           // YYYY-MM-DD
export function toMonthStr(d: Date) { return d.toLocaleDateString("sv").slice(0, 7) } // YYYY-MM
export function toWeekStr(d: Date): string {
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)) // nearest Thursday
  const w1 = new Date(t.getFullYear(), 0, 4)
  const wn = 1 + Math.round(((t.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)
  return `${t.getFullYear()}-W${String(wn).padStart(2, "0")}`
}

// The business date "today" belongs to — before the cutoff we're still
// closing out yesterday.
export function currentBusinessDate(): string {
  const now = new Date()
  if (now.getHours() < BUSINESS_DAY_CUTOFF_HOUR) {
    return toDateStr(new Date(now.getTime() - 86400000))
  }
  return toDateStr(now)
}

// Current business day as a Date (noon, to dodge TZ edges).
export function nowBusiness(): Date {
  return new Date(currentBusinessDate() + "T12:00:00")
}

// Business-day-aware ranges: each period opens at the cutoff hour, not midnight.
export function dayRange(s: string): [Date, Date] {
  const from = new Date(s + "T00:00:00")
  from.setHours(BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0)
  return [from, new Date(from.getTime() + 86400000 - 1)]
}

export function weekRange(s: string): [Date, Date] {
  const [yr, wk] = s.split("-W").map(Number)
  const jan4 = new Date(yr, 0, 4)
  const j4d = jan4.getDay() || 7
  const mon = new Date(jan4.getTime() + (wk - 1) * 7 * 86400000 - (j4d - 1) * 86400000)
  mon.setHours(BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0)
  return [mon, new Date(mon.getTime() + 7 * 86400000 - 1)]
}

export function monthRange(s: string): [Date, Date] {
  const [y, m] = s.split("-").map(Number)
  const from = new Date(y, m - 1, 1, BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0)
  const to   = new Date(y, m,     1, BUSINESS_DAY_CUTOFF_HOUR, 0, 0, 0)
  return [from, new Date(to.getTime() - 1)]
}
