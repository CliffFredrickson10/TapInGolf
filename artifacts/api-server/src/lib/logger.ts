import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    // Defense-in-depth: never emit personal data / secrets even if an object
    // carrying these keys is passed to the logger.
    "phone",
    "*.phone",
    "otp",
    "*.otp",
    "password",
    "*.password",
    "password_hash",
    "*.password_hash",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
