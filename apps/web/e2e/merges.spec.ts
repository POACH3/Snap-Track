// Stage 4 part 5 checks that a browser can make (docs/feature-plans/catalog-merges-plan.md):
// merging a store moves its receipts to the kept one; merging a category removes it from the
// tree. Names are unique per test, since everything made here stays for the rest of the run.
import { expect, test, type Page } from "@playwright/test";

async function logIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("e2e");
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible();
}

const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

/** A quick manual entry at a new store. */
async function expenseAt(page: Page, store: string, total: string) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Add expense" }).click();
  await page.getByPlaceholder("Search, or type a new store's name").fill(store);
  await page.getByRole("button", { name: `Create "${store}"` }).click();
  await page.getByLabel("Total").fill(total);
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(toast(page, "Expense saved.")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test.describe("desktop", { tag: "@desktop" }, () => {
  test("merging a store into another moves its receipts there", async ({ page }) => {
    await expenseAt(page, "Merge Shop One e2e", "3.10");
    await expenseAt(page, "Merge Shop Two e2e", "4.20");

    await page.goto("/library/stores");
    await page.getByRole("link", { name: /Merge Shop One e2e/ }).click();
    await page.getByRole("button", { name: "Merge into another store" }).click();
    await page.getByLabel("Find the one to keep").fill("Merge Shop Two");
    await page
      .getByRole("list", { name: "Merge into" })
      .getByRole("button", { name: "Merge Shop Two e2e" })
      .click();
    const confirm = page.getByRole("dialog", { name: "Merge Merge Shop One e2e into Merge Shop Two e2e?" });
    await confirm.getByRole("button", { name: "Merge stores" }).click();
    await expect(toast(page, "Stores merged.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Merge Shop Two e2e" })).toBeVisible();

    await page.goto("/");
    const rows = page.getByRole("list", { name: "Receipts" });
    await expect(rows.getByRole("button", { name: /Merge Shop Two e2e/ })).toHaveCount(2);
    await expect(rows.getByRole("button", { name: /Merge Shop One e2e/ })).toHaveCount(0);
  });

  test("merging a category into another removes it from the tree", async ({ page }) => {
    await page.goto("/library/labels");
    const tree = page.getByRole("list", { name: "Categories and classes" });
    for (const name of ["Merge Cat A e2e", "Merge Cat B e2e"]) {
      await page.getByRole("button", { name: "Category", exact: true }).click();
      await page.getByRole("dialog").getByLabel("Name").fill(name);
      await page.getByRole("button", { name: "Add category" }).click();
      await expect(tree.getByText(name)).toBeVisible();
    }
    await page.getByRole("button", { name: /Options for Merge Cat A e2e/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Merge into…" }).click();
    await page.getByLabel("Find the one to keep").fill("Merge Cat B");
    await page
      .getByRole("list", { name: "Merge into" })
      .getByRole("button", { name: /Merge Cat B e2e/ })
      .click();
    await page.getByRole("button", { name: "Merge categories" }).click();
    await expect(toast(page, "Merged.")).toBeVisible();
    await expect(tree.getByText("Merge Cat A e2e")).toBeHidden();
    await expect(tree.getByText("Merge Cat B e2e")).toBeVisible();
  });
});
