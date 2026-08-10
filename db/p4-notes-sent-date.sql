-- When the corrections went back to the factory.
--
-- Tess, 2026-08-10: "add 'fitting date' and 'date notes sent' into sample info
-- and on report", and then "new manual field for notes sent" — a date somebody
-- sets, not one stamped off the status.
--
-- A round already carries fitting_date; this is its companion. The status can
-- say "Notes sent to factory", but a status is a state, not a date, and "when
-- did the notes go back" is a question the report has to answer with a day. So a
-- real date column rather than words folded into the status or the comments —
-- the same reasoning that gave submitted_date, received_date and fitting_date
-- their own columns.
--
-- Additive and nullable. No existing row is touched; every round that predates
-- this reads null, which is exactly what it already meant — the notes have not
-- been sent, or nobody recorded when. Set by hand in the round form, exactly
-- like the other dates.
--
-- APPLIED to the live project on 2026-08-10.
alter table public.style_samples
  add column if not exists notes_sent_date date;

comment on column public.style_samples.notes_sent_date is
  'The day corrections were sent back to the factory. Null = not sent, or not recorded.';
