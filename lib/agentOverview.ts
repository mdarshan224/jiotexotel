/** Kolkata calendar boundaries. Fixed UTC+05:30 has no daylight-saving changes. */
const DAY = 86_400_000;
const IST = 19_800_000;
export function agentWeek(now = new Date(), offset = 0) {
  const local = new Date(now.getTime() + IST);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - IST;
  const monday = midnight - ((local.getUTCDay() + 6) % 7) * DAY + offset * 7 * DAY;
  return {start: new Date(monday), end: new Date(monday + 7 * DAY), today: new Date(midnight), days: Array.from({length: 7}, (_, i) => new Date(monday + i * DAY))};
}
export function agentDayKey(date: Date) { return new Date(date.getTime() + IST).toISOString().slice(0, 10); }
export function agentEarningDays(days: Date[], rows: {agentPaise: number; createdAt: Date}[]) {
  return days.map(date => ({date: agentDayKey(date), amount: rows.filter(row => agentDayKey(row.createdAt) === agentDayKey(date)).reduce((sum, row) => sum + row.agentPaise, 0) / 100}));
}
export type AgentOverview = {week: {start: string; end: string; total: number; days: {date: string; amount: number}[]}; today: {earnings: number; pickups: number}; completed: number; active: number};
