import { NextResponse } from "next/server";

// Same-origin image proxy so PNG export can read external reference images
// without cross-origin canvas tainting. Only used for export.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url || !/^https?:\/\//i.test(url)) {
    return new NextResponse("bad url", { status: 400 });
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return new NextResponse("fetch failed", { status: 502 });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("error", { status: 500 });
  }
}
