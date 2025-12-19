// date-utils.js
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function weekdayUTC() {
  return new Date().getUTCDay();
}

function isLastDayOfMonthUTC() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  ));
  return tomorrow.getUTCDate() === 1;
}

module.exports = {
  todayUTC,
  weekdayUTC,
  isLastDayOfMonthUTC
};
