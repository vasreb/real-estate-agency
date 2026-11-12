"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createApiClient, type ApiClient } from "./client";

const defaultClient = createApiClient();
const ApiClientContext = createContext<ApiClient>(defaultClient);

/** Lets tests inject a client with a fake fetch; production uses the default. */
export function ApiClientProvider({
  client,
  children,
}: {
  client?: ApiClient;
  children: ReactNode;
}) {
  return (
    <ApiClientContext.Provider value={client ?? defaultClient}>
      {children}
    </ApiClientContext.Provider>
  );
}

export const useApiClient = () => useContext(ApiClientContext);
