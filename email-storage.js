// email-storage.js
export function saveQueue(queue) {
  localStorage.setItem("emailQueue", JSON.stringify(queue));
}

export function loadQueue() {
  return JSON.parse(localStorage.getItem("emailQueue") || "[]");
}
