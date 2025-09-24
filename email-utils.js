// email-utils.js
export function formatTicketId(id) {
  return `TICKET-${String(id).padStart(6, "0")}`;
}

export function sanitizeInput(input) {
  return String(input).replace(/[<>]/g, "");
}
