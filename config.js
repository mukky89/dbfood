module.exports = {
  mongoUri: process.env.MONGO_URI,
  port: process.env.PORT || 3000,
  orderDeadline: process.env.ORDER_DEADLINE || "10:00",
  emailRecipient: process.env.EMAIL_RECIPIENT,
  emailSender: process.env.EMAIL_SENDER,
  emailPassword: process.env.EMAIL_PASSWORD,
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  restaurantUrl: process.env.RESTAURANT_URL || "https://www.fantozzi.sk/dennemenu",
  platbaIban: process.env.PLATBA_IBAN,
  platbaBic: process.env.PLATBA_BIC,
  platbaMeno: process.env.PLATBA_MENO,
  platbaVS: process.env.PLATBA_VS || "",
  smtpHost: process.env.SMTP_HOST || "smtp-relay.brevo.com",
  smtpPort: parseInt(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER,
  ntfyTopic: process.env.NTFY_TOPIC,
  ntfyUrl: process.env.NTFY_URL || "https://ntfy.sh"
};