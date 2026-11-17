// The board changes over at 9:00am London time, through GMT and BST alike.

const LONDON = 'Europe/London';
const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function londonParts(date) {
  const parts = Object.fromEntries(partsFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour };
}

/** The instant London clocks read 09:00 on the given calendar day. */
function nineOn(y, m, d) {
  const asGmt = Date.UTC(y, m - 1, d, 9);
  const shownHour = londonParts(new Date(asGmt)).h; // 9 in winter, 10 in summer
  return new Date(asGmt - (shownHour - 9) * 3600e3);
}

/** The most recent 9:00am London at or before `now`. */
export function lastNine(now = new Date()) {
  const p = londonParts(now);
  const today = nineOn(p.y, p.m, p.d);
  if (now >= today) return today;
  const yesterday = new Date(Date.UTC(p.y, p.m - 1, p.d) - 864e5);
  return nineOn(yesterday.getUTCFullYear(), yesterday.getUTCMonth() + 1, yesterday.getUTCDate());
}

/** The next 9:00am London after `now`. */
export function nextNine(now = new Date()) {
  const p = londonParts(new Date(lastNine(now).getTime() + 30 * 3600e3));
  return nineOn(p.y, p.m, p.d);
}

/** Today's date in London as YYYY-MM-DD. */
export function londonToday(now = new Date()) {
  const p = londonParts(now);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
