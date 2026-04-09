export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
      }}
    >
      <h1 style={{ color: "var(--color-primary)", marginBottom: "1rem" }}>
        Aria
      </h1>
      <p style={{ color: "var(--color-text-secondary)" }}>
        AI Meeting Intelligence
      </p>
    </main>
  );
}
