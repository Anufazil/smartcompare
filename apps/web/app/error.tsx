'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page-width empty-state" style={{ marginTop: 80 }}>
      <h1>A small snag.</h1>
      <p>We couldn’t load this page. Try once more.</p>
      <button className="button lime" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
