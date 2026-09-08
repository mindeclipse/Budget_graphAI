"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // Дані вважаються свіжими 5 хвилин
            gcTime: 1000 * 60 * 60 * 30, // Зберігати в кеші до 24 годин для offline-доступу
            refetchOnWindowFocus: false, // Не перезапитувати при перемиканні вкладок для економії трафіку
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
