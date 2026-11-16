import { createBrowserRouter } from "react-router";
import { CaptureScreen } from "../features/capture/CaptureScreen.tsx";
import { ItemScreen } from "../features/library/ItemScreen.tsx";
import { ItemsScreen } from "../features/library/ItemsScreen.tsx";
import { LibraryScreen } from "../features/library/LibraryScreen.tsx";
import { StoreScreen } from "../features/library/StoreScreen.tsx";
import { StoresScreen } from "../features/library/StoresScreen.tsx";
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
            Monthly breakdowns by store, item and category arrive in Stage 6, trends in Stage 7, and search
            and filters in Stage 9.
          </ComingLater>
        ),
      },
      {
        path: "budget",
        element: (
          <ComingLater title="Budget">
            Spending limits on items, tags and categories, with alerts, arrive in Stage 6.
          </ComingLater>
        ),
      },
      { path: "library", element: <LibraryScreen /> },
      { path: "library/stores", element: <StoresScreen /> },
      { path: "library/stores/:id", element: <StoreScreen /> },
      { path: "library/items", element: <ItemsScreen /> },
      { path: "library/items/:id", element: <ItemScreen /> },
      { path: "settings", element: <SettingsScreen /> },
      {
        path: "*",
        element: <EmptyState title="Page not found">There's nothing at this address.</EmptyState>,
      },
    ],
  },
]);
