"use client";

import { loginSchema, type LoginInput } from "@agency/contracts";
import { Alert, Button, Input } from "@agency/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ApiError,
  errorMessage,
  resetPrivateCache,
  useApiClient,
} from "@/shared/api";

type FormValues = z.input<typeof loginSchema>;

function loginErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401)
    return "Неверный email или пароль.";
  return errorMessage(error);
}

export function LoginForm() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const inFlight = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = async (values: LoginInput) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailure(null);
    try {
      await api.login(values);
      // A new account must never see the previous account's cached data.
      await resetPrivateCache(queryClient);
      router.replace("/deals");
    } catch (error) {
      setFailure(loginErrorMessage(error));
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => void handleSubmit(submit)(event)}
      aria-label="Вход"
    >
      {failure && <Alert>{failure}</Alert>}
      <div className="field">
        <label htmlFor="login-email">Email</label>
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p id="login-email-error" className="field-error">
            Введите корректный email.
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="login-password">Пароль</label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? "true" : "false"}
          aria-describedby={
            errors.password ? "login-password-error" : undefined
          }
          {...register("password")}
        />
        {errors.password && (
          <p id="login-password-error" className="field-error">
            Введите пароль.
          </p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Вход…" : "Войти"}
      </Button>
    </form>
  );
}
