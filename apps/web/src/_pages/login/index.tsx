import { LoginForm } from "@/features/auth";

/** Server-rendered shell; only the form is a client component. */
export function LoginPage() {
  return (
    <main id="main" className="page page-narrow">
      <h1>Вход</h1>
      <LoginForm />
    </main>
  );
}
