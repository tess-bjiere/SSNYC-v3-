"use client";

import { useState } from "react";
import Select from "@/app/components/Select";
import { brandName, type Brand } from "@/lib/brands";
import { addMember, removeMember } from "@/app/actions/allowlist";

export type Member = { email: string; role: string | null; brand: string | null };

// Add and remove the people who are not on the org domain (multi-brand phase 3).
// A talent is ideation-only and pinned to one brand; a guest can be full team.
// The org's own @theloyalist.com people are team by domain and are not listed.
// `brands` is the live list so a talent can be pinned to a god-mode-added brand.
export default function TalentsAdmin({ members, brands }: { members: Member[]; brands: Brand[] }) {
  const [role, setRole] = useState("talent");

  return (
    <div>
      {members.length === 0 ? (
        <p className="muted-line" style={{ marginBottom: 16 }}>
          No one added yet. Everyone at <strong>@theloyalist.com</strong> already gets in as team,
          all brands — add a person here only to bring in a brand&rsquo;s talent or an outside guest.
        </p>
      ) : (
        <table className="talents-table">
          <tbody>
            {members.map((m) => {
              const isTalent = (m.role ?? "team") === "talent";
              return (
                <tr key={m.email}>
                  <td className="talents-email">{m.email}</td>
                  <td>{isTalent ? "Talent" : "Team"}</td>
                  <td className="talents-brand">{isTalent ? brandName(m.brand, brands) : "All brands"}</td>
                  <td className="talents-remove">
                    <RemoveButton email={m.email} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form action={addMember} className="talents-add">
        <input
          className="input sm"
          name="email"
          type="email"
          placeholder="person@brand.com"
          aria-label="Email"
          required
        />
        <Select
          className="select sm"
          name="role"
          aria-label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: "talent", label: "Talent — ideation only" },
            { value: "team", label: "Team — full access" },
          ]}
        />
        {role === "talent" && (
          <Select
            className="select sm"
            name="brand"
            aria-label="Brand"
            defaultValue={brands[0]?.slug}
            options={brands.map((b) => ({ value: b.slug, label: b.name }))}
          />
        )}
        <button className="btn sm" type="submit">
          Add
        </button>
      </form>
    </div>
  );
}

// Two-click arm rather than a confirm() dialog, per the house rule — a native
// dialog freezes the browser automation the tool is built through.
function RemoveButton({ email }: { email: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className="btn link danger sm"
      onClick={() => (armed ? removeMember(email) : setArmed(true))}
      onMouseLeave={() => setArmed(false)}
    >
      {armed ? "Remove?" : "Remove"}
    </button>
  );
}
