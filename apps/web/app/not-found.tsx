import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="page-width empty-state" style={{ marginTop: 80 }}>
      <h1>This product isn’t on our list.</h1>
      <p>Let’s find something you can compare.</p>
      <Link href="/" className="button lime">
        Back to SmartCompare
      </Link>
    </main>
  );
}
