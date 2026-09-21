import nodemailer from "nodemailer";
import { serverEnv } from "@/lib/env";
import { fail } from "../types";
import type { EmailProvider } from "./index";

function credentials() {
  const env = serverEnv();
  const user = env.gmailUser.trim();
  const pass = env.gmailAppPassword.replace(/\s+/g, "");
  if (!user || !pass) return null;
  return { user, pass };
}

function transport() {
  const creds = credentials();
  if (!creds) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: creds,
  });
}

export const gmailEmail: EmailProvider = {
  async send({ to, subject, text }) {
    const started = Date.now();
    const creds = credentials();
    const smtp = transport();
    if (!creds || !smtp) {
      return fail("email", {
        code: "missing_key",
        message: "GMAIL_USER / GMAIL_APP_PASSWORD not set",
        retryable: false,
      });
    }
    try {
      const info = await smtp.sendMail({
        from: creds.user,
        to,
        subject,
        text,
      });
      return {
        ok: true,
        data: { id: info.messageId },
        meta: { kind: "email", model: "gmail", durationMs: Date.now() - started },
      };
    } catch (error) {
      return fail("email", {
        code: "upstream",
        message: error instanceof Error ? error.message : "SMTP failed",
        retryable: true,
      }, { model: "gmail", durationMs: Date.now() - started });
    }
  },

  async verify() {
    const started = Date.now();
    const smtp = transport();
    if (!smtp) {
      return fail("email_verify", {
        code: "missing_key",
        message: "Gmail is not configured",
        retryable: false,
      });
    }
    try {
      await smtp.verify();
      return {
        ok: true,
        data: { ok: true },
        meta: { kind: "email_verify", model: "gmail", durationMs: Date.now() - started },
      };
    } catch (error) {
      return fail("email_verify", {
        code: "upstream",
        message: error instanceof Error ? error.message : "SMTP verify failed",
        retryable: false,
      }, { model: "gmail", durationMs: Date.now() - started });
    }
  },
};
