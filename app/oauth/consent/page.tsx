import ConsentClient from "./ConsentClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page: React.CSSProperties = {
  maxWidth: 460,
  margin: "0 auto",
  padding: "56px 24px",
  fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
  color: "#111",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id } = await searchParams;
  if (!authorization_id) {
    return (
      <main style={page}>
        <h1 style={{ fontSize: 22 }}>Stock Market MCP</h1>
        <p style={{ color: "#b00020" }}>Missing authorization request. Start the connection again from your MCP client.</p>
      </main>
    );
  }
  return (
    <main style={page}>
      <ConsentClient authorizationId={authorization_id} />
    </main>
  );
}
