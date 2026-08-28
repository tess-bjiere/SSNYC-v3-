import type { Email } from "@/lib/notify";

// ---------------------------------------------------------------------------
// The thin shell around lib/notify (P4 — notifications)
//
// Everything about *who* gets mail and *what it says* is decided in lib/notify,
// which is pure and tested. This file is the only part that touches the world,
// and it is deliberately the boring part.
//
// The studio has no email provider key yet. Rather than block the feature on a
// procurement decision, an unconfigured send is a **no-op that reports itself**
// — not a thrown error, and not a silent success. The distinction matters at
// both ends: a comment must still save when mail is impossible (the comment is
// the point; the email is a courtesy), and "we sent it" must never be logged
// for mail that was never sent, or the first real outage looks like a working
// system.
//
// Two providers, either one switches the feature on — whichever is configured
// (SMTP is preferred when both are). `NOTIFY_FROM` is shared: the address the
// mail comes from.
//
// 1) SMTP — for sending through Google Workspace (or any SMTP host) with no DNS
//    to set up, because the domain's mail auth is already handled by the provider
//    you send through (Tess, 2026-08-26: "is there a way to send notifications to
//    team without ... TL dns" — she does not manage the domain's DNS). For Gmail:
//
//      SMTP_HOST=smtp.gmail.com
//      SMTP_PORT=465
//      SMTP_USER=you@theloyalist.com
//      SMTP_PASS=<a Google App Password, not your login password>
//      NOTIFY_FROM="SSYNC <you@theloyalist.com>"   (use the same address)
//
// 2) Resend — a single POST with an API key; needs a verified sending domain:
//
//      RESEND_API_KEY=re_...
//      NOTIFY_FROM="SSYNC <ssync@theloyalist.com>"
//
// With neither set, everything below runs, decides correctly, and delivers
// nothing — a reported no-op, so a comment still saves and nothing claims a send
// that did not happen.
// ---------------------------------------------------------------------------

export type SendReport = {
  configured: boolean;
  sent: number;
  failed: number;
  /** Addresses that would have been mailed had a provider been configured. */
  skipped: string[];
};

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.NOTIFY_FROM
  );
}
function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM);
}

export function isMailConfigured(): boolean {
  return smtpConfigured() || resendConfigured();
}

/** Where the links in an email point. Falls back to local dev. */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

// One reused SMTP connection pool. Built lazily on first send and cached, so a
// burst of notifications shares one authenticated connection. `nodemailer` is a
// server-only dependency (kept out of the bundle via serverExternalPackages), so
// it is imported dynamically here rather than at module top.
type Transport = { sendMail: (m: Record<string, unknown>) => Promise<unknown> };
let transportPromise: Promise<Transport> | null = null;
function smtpTransport(): Promise<Transport> {
  if (!transportPromise) {
    transportPromise = import("nodemailer").then((nm) => {
      const port = Number(process.env.SMTP_PORT) || 465;
      return (nm.default ?? nm).createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      }) as Transport;
    });
  }
  return transportPromise;
}

async function sendViaSmtp(email: Email): Promise<boolean> {
  try {
    const transport = await smtpTransport();
    await transport.sendMail({
      from: process.env.NOTIFY_FROM,
      to: email.to,
      subject: email.subject,
      text: email.text,
    });
    return true;
  } catch (err) {
    console.warn(`[notify] ${email.to}: SMTP send failed`, err);
    return false;
  }
}

async function sendViaResend(email: Email): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
    });
    if (!res.ok) {
      console.warn(`[notify] ${email.to}: provider returned ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    // A dead provider must not take a comment down with it.
    console.warn(`[notify] ${email.to}: send failed`, err);
    return false;
  }
}

// SMTP wins when both are set, so a studio that adds Workspace SMTP does not have
// to unset Resend first.
async function sendOne(email: Email): Promise<boolean> {
  return smtpConfigured() ? sendViaSmtp(email) : sendViaResend(email);
}

export async function sendEmails(emails: Email[]): Promise<SendReport> {
  if (emails.length === 0) return { configured: isMailConfigured(), sent: 0, failed: 0, skipped: [] };

  if (!isMailConfigured()) {
    // Loud enough to find in a log, quiet enough not to be an error — this is
    // the expected state until a key exists.
    console.info(
      `[notify] no provider configured; ${emails.length} email(s) not sent: ` +
        emails.map((e) => e.to).join(", ")
    );
    return { configured: false, sent: 0, failed: 0, skipped: emails.map((e) => e.to) };
  }

  const results = await Promise.all(emails.map(sendOne));
  return {
    configured: true,
    sent: results.filter(Boolean).length,
    failed: results.filter((ok) => !ok).length,
    skipped: [],
  };
}
