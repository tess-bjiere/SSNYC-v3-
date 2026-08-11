// Who is "god mode" (Tess, 2026-08-11: "admin / god mode ... a named super-admin
// list"). Distinct from team: every @theloyalist.com person is team, but adding
// or renaming a brand is a rare, structural act, so it is a short explicit list.
//
// tess@theloyalist.com is a super-admin by default so the feature works out of
// the box; more can be named in the SSYNC_SUPER_ADMINS env var (comma- or
// space-separated). Pure and dependency-free — the env string is read at the
// edge and handed in.

const DEFAULT_SUPER_ADMINS = ["tess@theloyalist.com"];

/** Split the SSYNC_SUPER_ADMINS env value into lowercased emails. */
export function parseSuperAdmins(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** True if this email is a super-admin — the built-in list plus any extras. */
export function isSuperAdmin(
  email: string | null | undefined,
  extra: readonly string[] = []
): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  return DEFAULT_SUPER_ADMINS.includes(e) || extra.includes(e);
}
