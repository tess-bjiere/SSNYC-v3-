// One style's details as a downloadable CSV.
//
// Tess, 2026-08-07: "have an option to export csv of the above info from a
// style profile".
//
// A route rather than a client-side Blob, for one reason: the file is built
// from the row the database holds, not from the props the page happened to
// render. A style profile shows some fields inside a modal and some behind a
// tab, and an export assembled from the DOM would quietly depend on what was on
// screen. This asks the database and gets everything.
//
// It is a GET, so it is a link. Nothing is written and nothing is logged, which
// means it is safe to open twice, safe to bookmark, and safe to hand to
// somebody as a URL.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/access";
import { styleCsv, styleCsvFilename, type CsvStyleLike } from "@/lib/styleCsv";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("styles")
    // Exactly the ten columns the file has. Selecting more than is exported
    // would leave the next person to read this wondering which list is the real
    // one.
    .select(
      "name,garment,style_no,colors,blank_style,fabric,material,hs_code,country_of_origin,weight_lbs"
    )
    .eq("id", id)
    // A style in the Trash is not exported. It is still there, and restoring it
    // makes this work again — the row is not gone, it has stopped being read.
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return new NextResponse("Not found", { status: 404 });

  const style = data as CsvStyleLike;
  return new NextResponse(styleCsv([style]), {
    headers: {
      // text/csv rather than application/octet-stream so a person who opens it
      // in a browser tab sees text instead of being asked what to do with it.
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${styleCsvFilename(style)}"`,
      "cache-control": "no-store",
    },
  });
}
