// SMTP mail via Nodemailer. Transport is created lazily and cached; when SMTP
// is unconfigured, sendMail logs the message server-side instead — enough for
// local development, and in production a missing config surfaces as an error
// log for ops without leaking any behaviour to the API caller.
import "dotenv/config";
import { createTransport, type Transporter } from "nodemailer";

const globalForMail = globalThis as unknown as { transporter?: Transporter };

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

function getTransport(): Transporter {
  if (globalForMail.transporter) return globalForMail.transporter;
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SMTP_PORT must be a valid port number");
  globalForMail.transporter = createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  return globalForMail.transporter;
}

export type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail(mail: Mail): Promise<{ delivered: boolean }> {
  if (!smtpConfigured()) {
    // Dev/no-SMTP fallback: never silently drop, but keep secrets out of
    // client-visible behaviour. Links are only logged server-side.
    console.warn(JSON.stringify({
      level: "warn", event: "mail_unconfigured_fallback",
      to: mail.to, subject: mail.subject, body: mail.text,
    }));
    return { delivered: false };
  }
  await getTransport().sendMail({
    from: process.env.MAIL_FROM ?? "Melio Bookstore <no-reply@localhost>",
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return { delivered: true };
}
