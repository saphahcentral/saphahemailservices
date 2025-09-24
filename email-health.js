// email-health.js
import { config } from "./email-config.js";

export function healthCheck() {
  return {
    service: config.serviceName,
    status: "OK",
    timestamp: new Date().toISOString()
  };
}
