import OrderDetail from "./OrderDetail";

export const dynamic = "force-dynamic";

// An order opens here; a quote opens at /quotes/[id]. Both render the same shared
// OrderDetail — the separate URLs only exist so the nav underlines the right
// section (Tess, 2026-08-26).
export default async function MaterialOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}
