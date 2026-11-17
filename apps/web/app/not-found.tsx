import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="page page-narrow">
      <h1>Record not found</h1>
      <p>The deal does not exist or is unavailable.</p>
      <p>
        <Link href="/deals">Back to deals</Link>
      </p>
    </main>
  );
}
