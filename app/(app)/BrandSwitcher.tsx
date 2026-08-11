"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Select from "@/app/components/Select";
import { type Brand } from "@/lib/brands";
import { setActiveBrand } from "@/app/actions/brand";

// The brand the team is looking at (multi-brand phase 1, Tess 2026-08-11).
//
// Only shown to the team; a talent is pinned to their own brand and never sees
// this (phase 2). Choosing a brand sets the cookie server-side and refreshes, so
// every scoped list re-loads for the new brand without a full navigation.
export default function BrandSwitcher({ active, brands }: { active: string; brands: Brand[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      className="select sm brand-switcher"
      aria-label="Brand"
      value={active}
      disabled={pending}
      onChange={(slug) =>
        start(async () => {
          await setActiveBrand(slug);
          router.refresh();
        })
      }
      options={brands.map((b) => ({ value: b.slug, label: b.name }))}
    />
  );
}
