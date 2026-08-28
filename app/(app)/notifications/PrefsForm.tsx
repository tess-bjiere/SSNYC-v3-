"use client";

import { useState, useTransition } from "react";
import { savePrefs, sendTestEmail } from "@/app/actions/notify";
import type { NotifyChannel } from "@/lib/notify";

const SWITCHES: { key: NotifyChannel; label: string; help: string }[] = [
  {
    key: "comment",
    label: "Comments",
    help: "When someone comments on a style you created or have commented on — and when a comment of yours is marked received.",
  },
  {
    key: "status",
    label: "Status changes",
    help: "When one of those styles moves between Inspo, Development, Production and Archived.",
  },
];

// Saves on toggle rather than behind a Save button: two switches is not a form,
// and a settings page that can be left in an unsaved state is a settings page
// that lies to you about what it is doing.
export default function PrefsForm({
  initial,
}: {
  initial: Partial<Record<NotifyChannel, boolean>>;
}) {
  const [on, setOn] = useState<Record<NotifyChannel, boolean>>({
    // Unset means subscribed — the same rule the server applies.
    comment: initial.comment !== false,
    status: initial.status !== false,
  });
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The self-test: proves the provider is wired without a second person.
  const [testing, setTesting] = useState(false);
  const [testSaid, setTestSaid] = useState<string | null>(null);

  function test() {
    setTesting(true);
    setTestSaid(null);
    start(async () => {
      try {
        const r = await sendTestEmail();
        if (!r.configured) {
          setTestSaid("No email provider is connected yet — nothing was sent.");
        } else if (r.sent > 0) {
          setTestSaid(`Sent to ${r.to}. Check your inbox (and spam) in a minute.`);
        } else {
          setTestSaid("The provider is set but the send failed — double-check SMTP_USER / SMTP_PASS in Vercel.");
        }
      } catch {
        setTestSaid("Couldn't send the test — try again.");
      } finally {
        setTesting(false);
      }
    });
  }

  function toggle(key: NotifyChannel) {
    const next = !on[key];
    setOn((prev) => ({ ...prev, [key]: next }));
    start(async () => {
      const res = await savePrefs({ [key]: next });
      if (res?.ok) {
        setSaid("Saved.");
        window.setTimeout(() => setSaid(null), 1800);
      } else {
        // Put the switch back rather than showing a state that isn't stored.
        setOn((prev) => ({ ...prev, [key]: !next }));
        setSaid(res?.error ?? "Couldn't save.");
      }
    });
  }

  return (
    <div className="prefs">
      {SWITCHES.map((s) => (
        <div className="pref-row" key={s.key}>
          <div className="pref-copy">
            <div className="pref-label">{s.label}</div>
            <div className="pref-help">{s.help}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on[s.key]}
            aria-label={s.label}
            disabled={pending}
            className={"toggle" + (on[s.key] ? " on" : "")}
            onClick={() => toggle(s.key)}
          >
            <span className="knob" />
          </button>
        </div>
      ))}
      {said && <div className="pref-said">{said}</div>}

      {/* End-to-end check: send yourself a test email through the real mailer. */}
      <div className="pref-test">
        <button type="button" className="btn ghost sm" onClick={test} disabled={testing || pending}>
          {testing ? "Sending…" : "Send test email to me"}
        </button>
        {testSaid && <span className="pref-test-said">{testSaid}</span>}
      </div>
    </div>
  );
}
