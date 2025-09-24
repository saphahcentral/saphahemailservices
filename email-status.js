// email-status.js
// Simulated ticket/email status tracking

const ticketStore = new Map();

export function saveTicket(id, status) {
  ticketStore.set(id, status);
}

export function getTicketStatus(id) {
  return ticketStore.get(id) || "Unknown Ticket ID";
}
