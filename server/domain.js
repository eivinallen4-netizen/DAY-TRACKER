export function dayAt(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function shiftDay(day, amount) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0,10);
}
export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(+date) && date.toISOString().slice(0,10) === value;
}
export function metrics(completions, today) {
  const days = [...new Set(completions.map(c=>c.day).filter(d=>d<=today))].sort();
  const active = new Set(days);
  let cursor = active.has(today) ? today : shiftDay(today,-1), streak = 0;
  while(active.has(cursor)) { streak++; cursor = shiftDay(cursor,-1); }
  let best = 0, run = 0, previous;
  for(const day of days) { run = previous && shiftDay(previous,1) === day ? run+1 : 1; best=Math.max(best,run); previous=day; }
  const xp = completions.filter(c=>c.day<=today).length * 10;
  return { streak, best, xp, level:Math.floor(xp/100)+1, activeDays:days.length };
}
