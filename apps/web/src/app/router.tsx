import { createBrowserRouter } from "react-router";
import { CaptureScreen } from "../features/capture/CaptureScreen.tsx";
import { ComingLater } from "../features/placeholders/ComingLater.tsx";
import { ReceiptScreen } from "../features/receipts/ReceiptScreen.tsx";
import { ReceiptsScreen } from "../features/receipts/ReceiptsScreen.tsx";
import { SettingsScreen } from "../features/settings/SettingsScreen.tsx";
import { EmptyState } from "../shared/ui/EmptyState.tsx";
import { App } from "./App.tsx";

/** Every screen. `App` shows the login screen instead while signed out. */
export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <ReceiptsScreen /> },
      { path: "capture", element: <CaptureScreen /> },
      { path: "receipts/:id", element: <ReceiptScreen /> },
      {
        path: "analytics",
        element: (
          <ComingLater title="Analytics">
            Monthly breakdowns by store, item and category arrive in Stage 6, and trends in Stage 7.
          </ComingLater>
        ),
      },
      {
        path: "search",
        element: <ComingLater title="Search">Search, filters and date ranges arrive in Stage 9.</ComingLater>,
      },
      { path: "settings", element: <SettingsScreen /> },
      {
        path: "*",
        element: <EmptyState title="Page not found">There's nothing at this address.</EmptyState>,
      },
    ],
  },
]);
