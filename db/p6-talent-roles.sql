-- Multi-brand phase 2: roles, and the brand a talent is pinned to.
--
-- Tess, 2026-08-11: "any loyalist team member should be able to access each
-- brand, but certain brand specific talents would only have access to a limited
-- view of their brand. … The talent view would just be the ideation side."
--
-- The whole model rides on app_allowlist, which already answers "may this
-- address in?". Two columns answer the rest:
--
--   role   'team' or 'talent'. Absent means 'team' — an allowlisted guest today
--          has full access, and nothing about them should change. A talent is
--          the new, deliberately narrower thing.
--   brand  the one brand a talent is confined to. Null for team, who move
--          between all brands with the switcher.
--
-- Anyone at the org domain (@theloyalist.com) is team regardless of this table;
-- the row-level role only decides things for people who are on the allowlist,
-- i.e. the brand-specific talents.
--
-- APPLIED to the live project on 2026-08-11. Additive and nullable; the one
-- existing row (tess, owner) is org-domain team and untouched.
alter table public.app_allowlist add column if not exists role text;
alter table public.app_allowlist add column if not exists brand text;

comment on column public.app_allowlist.role is
  'team | talent. Null reads as team. A talent is pinned to one brand and sees only the ideation side.';
comment on column public.app_allowlist.brand is
  'The brand a talent is confined to. Null for team.';
