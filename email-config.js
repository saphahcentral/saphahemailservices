// email-config.js
export const CONFIG = {
  serviceName: "saphahemailservices",
  retryLimit: 3,
  queueInterval: 5000, // ms
  defaultFrom: "saphahcentralservices@gmail.com"
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: 465,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  FROM: "Saphah Central Support <saphahemailservices@gmail.com>",
};
