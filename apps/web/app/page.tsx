import { redirect } from "next/navigation";

// Server-only redirect; authentication/data gates live on the target routes.
export default function HomePage() {
  redirect("/deals");
}
