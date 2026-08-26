import OrderDetail from "@/app/(app)/material-orders/[id]/OrderDetail";

export const dynamic = "force-dynamic";

// A quote's own URL, so the nav underlines Quotes and not Orders (Tess,
// 2026-08-26: "when i click a quote it then looks like it opens under orders since
// orders is then underlined"). The loader and the client are shared with orders;
// the client renders quote mode from the row's kind.
export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}
