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
          <b>Steam the sample first.</b> Shipping creases read as fit problems,
          and then you chase something the press would have fixed.
        </li>
        <li>
          <b>Rake the light across black, don&rsquo;t face it.</b> Key light at
          45° to the side, overexpose about +1 stop, no direct flash, and a white
          board on the shadow side. Turn the overheads off — one light source.
        </li>
        <li>
          <b>Set the room the same every round.</b> Tape the floor marks for the
          model and tripod so two rounds line up and you can see what changed.
        </li>
        <li>
          <b>On a phone:</b> use the 2× lens (1× bows the body), tap the garment
          to lock focus and exposure, turn off portrait and HDR, and send
          originals by AirDrop or upload — not iMessage or Slack, which
          recompress them.
        </li>
        <li>
          <b>Mark the problem in white</b> — chalk, tape or pins — and lay a tape
          measure in frame when the amount matters, so the photo shows it.
        </li>
        <li>
          <b>Shoot the same set each round:</b> front, back, both sides,
          three-quarter, seated, in motion, a detail frame for every issue, and
          the labels.
        </li>
      </ul>

      <h2>Notes</h2>
      <ul>
        <li>
          <b>Log the sample on arrival.</b> Measure it against the tech pack and
          flag blockers — wrong fabric, missing trim — before you book the
          fitting.
        </li>
        <li>
          <b>Two people in the room:</b> one handles the garment and talks, one
          writes and shoots. Write verbatim, and put the photo number in the note
          as you go.
        </li>
        <li>
          <b>Separate what you see from what you&rsquo;re asking for.</b> Every
          issue needs both — an observation and an instruction.
        </li>
        <li>
          <b>One shape per issue:</b> area · observed · action · amount ·
          priority · photo · owner · status.
        </li>
        <li>
          <b>Direction and amount, always</b> — never &ldquo;tighter&rdquo; or
          &ldquo;a bit.&rdquo; One name per component; left and right are the
          wearer&rsquo;s. Keep fabric issues (hand, recovery, shade) apart from
          fit corrections.
        </li>
        <li>
          <b>Clean up within a day</b> and carry every open issue forward from
          the last round, marked resolved or still open. Cold-read test: hand it
          to someone who wasn&rsquo;t there — if they have a question, it&rsquo;s
          not finished.
        </li>
      </ul>
    </div>
  );
}
