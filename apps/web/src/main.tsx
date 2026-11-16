import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import { RouterProvider } from "react-router";
import { router } from "./app/router.tsx";
import { startTheme } from "./shared/theme.ts";
import { ToastProvider } from "./shared/ui/Toasts.tsx";
import "./app/theme.css";
import "./app/base.css";

startTheme();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
