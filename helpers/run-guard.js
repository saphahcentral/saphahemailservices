// run-guard.js
const fs = require('fs');
const path = require('path');
const {
  todayUTC,
  weekdayUTC,
  isLastDayOfMonthUTC
} = require('./date-utils');

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function shouldRun(type) {
  const data = loadData();
  const today = todayUTC();

  if (data[type].lastRun === today) {
    console.log(`ℹ️ ${type.toUpperCase()} already run today (${today}). Exit 0.`);
    process.exit(0);
  }

  if (type === 'weekly') {
    if (weekdayUTC() !== data.weekly.weekday) {
      console.log('ℹ️ Not weekly run day. Exit 0.');
      process.exit(0);
    }
  }

  if (type === 'monthly') {
    if (data.monthly.day === 'last' && !isLastDayOfMonthUTC()) {
      console.log('ℹ️ Not last day of month. Exit 0.');
      process.exit(0);
    }
  }

  return data;
}

function markRun(type, data) {
  data[type].lastRun = todayUTC();

  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

module.exports = {
  shouldRun,
  markRun
};
