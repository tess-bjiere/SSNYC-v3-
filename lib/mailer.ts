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
// Provider: Resend, chosen because it is a single POST with an API key and no
// SDK, so swapping it later means editing one function. Set two environment
// variables to switch it on:
//
//   RESEND_API_KEY=re_...
//   NOTIFY_FROM="SSYNC <ssync@theloyalist.com>"
//
// Until then everything below runs, decides correctly, and delivers nothing.
// ---------------------------------------------------------------------------

export type SendReport = {
  configured: boolean;
  sent: number;
  failed: number;
  /** Addresses that would have been mailed had a provider been configured. */
  skipped: string[];
};

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM);
}

/** Where the links in an email point. Falls back to local dev. */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

async function sendOne(email: Email): Promise<boolean> {
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
