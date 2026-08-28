// The short version of the studio's Fit Room Standard (Tess, 2026-08-26: "best
// practice for fit images and notes ... very simple and short"). The full
// standard lives elsewhere; this is the one-screen reminder, linked from the
// footer. Same guide styling so it reads like the rest of the help.

export const dynamic = "force-dynamic";

export default function FitTipsPage() {
  return (
    <div className="guide">
      <h1 className="page-title">Fit photos &amp; notes</h1>

      <p className="guide-intro">
        Every fitting produces two things — images and notes — and both have to
        make sense to someone who wasn&rsquo;t in the room. The short version:
      </p>

      <h2>Photos</h2>
      <ul>
        <li>
          <b>Always front, back and side.</b> That is the set every product gets,
          every round. Anything else — three-quarter, seated, in motion, a
          close-up of an issue, the labels — is per product, shot when the garment
          needs it.
        </li>
        <li>
          <b>Steam the sample first.</b> Shipping creases look like fit problems,
          and you&rsquo;ll waste a round chasing something a press would have fixed.
        </li>
        <li>
          <b>Light black from the side, not head-on.</b> One light at 45°, about a
          stop brighter than usual, no direct flash, and a white board on the
          shadow side. Overheads off — one light source.
        </li>
        <li>
          <b>Set the room up the same every round.</b> Tape floor marks for the
          model and the tripod, so two rounds line up and you can see what changed.
        </li>
        <li>
          <b>On a phone:</b> use the 2× lens — the 1× curves the body — tap the
          garment to lock focus and exposure, turn off Portrait and HDR, and send
          originals by AirDrop or upload, not iMessage or Slack (they recompress).
        </li>
        <li>
          <b>Mark the problem in white</b> — chalk, tape or pins — and put a tape
          measure in the frame when the amount matters, so the photo shows it.
        </li>
      </ul>

      <h2>Notes</h2>
      <ul>
        <li>
          <b>Log the sample when it arrives.</b> Measure it against the tech pack
          and flag blockers — wrong fabric, missing trim — before you book the
          fitting.
        </li>
        <li>
          <b>Two people in the room:</b> one handles the garment and talks, one
          writes and shoots. Write it down word for word, and note the photo
          number as you go.
        </li>
        <li>
          <b>Write what you see and what you&rsquo;re asking for.</b> Every issue
          needs both — the observation and the fix.
        </li>
        <li>
          <b>Give every issue the same fields:</b> area · what you saw · the fix ·
          amount · priority · photo · owner · status.
        </li>
        <li>
          <b>Always a direction and an amount</b> — never &ldquo;tighter&rdquo; or
          &ldquo;a bit.&rdquo; One name per component; left and right are the
          wearer&rsquo;s. Keep fabric issues (hand, recovery, shade) separate from
          fit fixes.
        </li>
        <li>
          <b>Clean up within a day,</b> and carry every open issue forward from
          the last round, marked resolved or still open. Cold-read test: hand it
          to someone who wasn&rsquo;t there — if they have a question, it&rsquo;s
          not finished.
        </li>
      </ul>
    </div>
  );
}
