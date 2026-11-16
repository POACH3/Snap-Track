// Stage 4 part 4 checks that a browser can make (docs/feature-plans/manual-entry-plan.md): quick
// and full manual entries are saved confirmed and listed as manual; a likely duplicate is flagged
// while typing and on the receipt page, where Not a duplicate and Delete receipt work. Stores made
// here stay for the rest of the run, so names are unique per test.
import { expect, test, type Page } from "@playwright/test";

async function logIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("e2e");
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible();
}

const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

/** Chooses a store on the form: an existing one by name, else a new one. */
async function chooseStore(page: Page, name: string) {
  await page.getByPlaceholder("Search, or type a new store's name").fill(name);
  const existing = page
    .getByRole("list", { name: "Matching stores" })
    .getByRole("button", { name, exact: true });
  const create = page.getByRole("button", { name: `Create "${name}"` });
  await expect(existing.or(create)).toBeVisible();
  if (await existing.isVisible()) await existing.click();
  else await create.click();
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test.describe("desktop", { tag: "@desktop" }, () => {
  test("a quick entry is saved and listed as manual; a second one like it is flagged, dismissed and deleted", async ({
    page,
  }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByRole("heading", { name: "Add expense" })).toBeVisible();
    await chooseStore(page, "Quick Café e2e");
    await page.getByLabel("Total").fill("12.50");
    await page.getByRole("button", { name: "Category: none. Choose one" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Dining", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save category" }).click();
    await expect(
      page.getByRole("button", { name: "Category: Dining, this purchase. Change it" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(toast(page, "Expense saved.")).toBeVisible();

    const rows = page.getByRole("list", { name: "Receipts" });
    await expect(rows.getByRole("button", { name: /Quick Café e2e\s*Manual/ })).toBeVisible();

    // The same store, date and total again: flagged while typing, saved anyway.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Add expense" }).click();
    await chooseStore(page, "Quick Café e2e");
    await page.getByLabel("Total").fill("12.50");
    await expect(page.getByText("This may be a duplicate")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(toast(page, "Expense saved.")).toBeVisible();

    // On the receipt page: Not a duplicate hides the warning for the pair.
    await rows
      .getByRole("button", { name: /Quick Café e2e/ })
      .first()
      .click();
    await page.getByRole("link", { name: "View details" }).click();
    await expect(page.getByText("This may be a duplicate")).toBeVisible();
    await page.getByRole("button", { name: "Not a duplicate" }).click();
    await expect(page.getByText("This may be a duplicate")).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Quick Café e2e" })).toBeVisible();
    await expect(page.getByText("This may be a duplicate")).toBeHidden();

    // Delete receipt asks first, then the entry is gone.
    await page.getByRole("button", { name: "Delete receipt" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this receipt?" });
    await expect(confirm).toContainText("will be removed from every total");
    await confirm.getByRole("button", { name: "Delete receipt" }).click();
    await expect(toast(page, "Receipt deleted.")).toBeVisible();
    await expect(rows.getByRole("button", { name: /Quick Café e2e/ })).toHaveCount(1);
  });

  test("a full entry with lines is saved and listed as manual", async ({ page }) => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Add expense" }).click();
    await page.getByRole("button", { name: "Items", exact: true }).click();
    await chooseStore(page, "Full Hardware e2e");
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Printed name").fill("Paint, 1 gal");
    await page.getByLabel("Amount charged").fill("34.98");
    await page.getByLabel("Total", { exact: true }).fill("34.98");
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(toast(page, "Expense saved.")).toBeVisible();
    const row = page
      .getByRole("list", { name: "Receipts" })
      .getByRole("button", { name: /Full Hardware e2e\s*Manual/ });
    await row.click();
    await expect(page.getByRole("list", { name: "Items" }).getByText("Paint, 1 gal")).toBeVisible();
  });
});

test.describe("phone", { tag: "@phone" }, () => {
  test("Add expense opens from the Receipts list, fills the screen, and saves", async ({ page }) => {
    await page.getByRole("link", { name: "Add expense" }).click();
    await expect(page.getByRole("heading", { name: "Add expense" })).toBeVisible();
    // No tab bar here, and the page itself never scrolls; only the card's body does.
    await expect(page.getByRole("button", { name: "Snap receipt" })).toBeHidden();
    expect(
      await page.evaluate(() => {
        window.scrollTo(0, 10_000);
        return document.scrollingElement?.scrollTop ?? window.scrollY;
      }),
    ).toBe(0);
    await chooseStore(page, "Phone Deli e2e");
    await page.getByLabel("Total").fill("8.25");
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(toast(page, "Expense saved.")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Receipts" }).getByRole("button", { name: /Phone Deli e2e\s*Manual/ }),
    ).toBeVisible();
  });
});
