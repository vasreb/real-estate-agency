import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="page page-narrow">
      <h1>Запись не найдена</h1>
      <p>Сделка не существует или недоступна.</p>
      <p>
        <Link href="/deals">К списку сделок</Link>
      </p>
    </main>
  );
}
