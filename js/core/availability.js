// McDonald's Portugal serves breakfast from 08:00 to 11:00. Items flagged `breakfastOnly`
// in js/data/mcdonalds.js are unavailable outside that window, judged on the device's local time.
export const BREAKFAST = { start: '08:00', end: '11:00' };

const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function isBreakfastTime(date = new Date()) {
  const now = date.getHours() * 60 + date.getMinutes();
  return now >= minutes(BREAKFAST.start) && now < minutes(BREAKFAST.end);
}

export function isAvailable(item, date = new Date()) {
  return !item.breakfastOnly || isBreakfastTime(date);
}
