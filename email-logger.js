// email-logger.js
// Basic internal logging

const logs = [];

export function logEmail(action, details) {
  const entry = {
    time: new Date().toISOString(),
    action,
    details
  };
  logs.push(entry);
  console.log("[saphahemailservices LOG]", entry);
}

export function getLogs() {
  return logs;
}
