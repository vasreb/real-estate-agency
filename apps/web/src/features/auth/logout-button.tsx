"use client";

import { Alert, Button } from "@agency/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { resetPrivateCache, useApiClient } from "@/shared/api";

export function LogoutButton() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await api.logout();
      await resetPrivateCache(queryClient);
      router.replace("/login");
    } catch {
      // The session may still be active: do not pretend it was revoked.
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="logout">
      <Button
        variant="outline"
        onClick={() => void logout()}
        disabled={pending}
      >
        {pending ? "Выход…" : "Выйти"}
      </Button>
      {failed && (
        <Alert>
          Не удалось выйти: сессия может быть активна. Повторите попытку.
        </Alert>
      )}
    </div>
  );
}
