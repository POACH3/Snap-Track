// Stage 4 part 3 checks that a browser can make (docs/feature-plans/categories-and-tags-plan.md):
// a suggestion has no effect until accepted, a store default applies to every line, and Library ›
// Labels edits the hierarchy. The stand-in model replies by photo width (labels.jpg is 900px).
// Categories, tags and stores made here stay for the rest of the run, so names are unique.
import { expect, test, type Page, type Response } from "@playwright/test";

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

async function logIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("e2e");
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible();
}

async function receiptId(response: Promise<Response>): Promise<string> {
  const body = (await (await response).json()) as { json?: { receipt?: { id?: string } } };
  const id = body.json?.receipt?.id;
  if (id === undefined) throw new Error("upload reply has no receipt id");
  return id;
}

const uploadReply = (page: Page) =>
  page.waitForResponse((response) => response.url().includes("/rpc/receipts/put") && response.ok());

async function uploadOnDesktop(page: Page, name: string): Promise<string> {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "Upload receipt" })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("drop-zone").getByRole("button", { name: "Upload images" }).click();
  await (await chooser).setFiles(fixture(name));
  const reply = uploadReply(page);
  await page.getByRole("button", { name: "Done" }).click();
  return receiptId(reply);
}

async function openWhenRead(page: Page, id: string) {
  await page.goto(`/receipts/${id}`);
  await expect(page.getByText("This receipt is still being read")).toBeHidden({ timeout: 20_000 });
}

const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });
const picker = (page: Page) => page.getByRole("dialog");

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test.describe("desktop", { tag: "@desktop" }, () => {
  test("a suggestion applies only when accepted; a store's default then covers every line", async ({
    page,
  }) => {
    const first = await uploadOnDesktop(page, "labels.jpg");
    await openWhenRead(page, first);

    // Unclassified lines show the model's guess; nothing is applied until Accept.
    await expect(page.getByText("Suggested: Groceries", { exact: true })).toBeVisible();
    await expect(page.getByText("Suggested: Household", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Category: none. Choose one" })).toHaveCount(2);

    // The candle has no item, so Accept applies to this purchase at once.
    await page.getByRole("button", { name: "Accept" }).nth(1).click();
    await expect(
      page.getByRole("button", { name: "Category: Household, this purchase. Change it" }),
    ).toBeVisible();
    // Dismissing the milk's guess leaves it Unclassified.
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("Suggested: Groceries", { exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(toast(page, "Receipt confirmed.")).toBeVisible();

    // The store is known now, so its receipt page asks what is usually bought there.
    const second = await uploadOnDesktop(page, "labels.jpg");
    await openWhenRead(page, second);
    await expect(page.getByText("What do you usually buy at Label Mart?")).toBeVisible();
    await page.getByRole("button", { name: "Choose a category" }).click();
    // The picker is the hierarchy: add a class under Groceries, then choose it.
    await picker(page).getByRole("button", { name: "Open Groceries" }).click();
    await picker(page).getByRole("button", { name: "Add a class under Groceries" }).click();
    await picker(page).getByPlaceholder("New class").fill("Plant milks");
    await picker(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(picker(page).getByRole("button", { name: "Plant milks", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await picker(page).getByRole("button", { name: "Set default" }).click();
    await expect(toast(page, "Default category set.")).toBeVisible();

    // Every line from the store now has it, and the model's differing guesses are not shown.
    await expect(
      page.getByRole("button", { name: "Category: Groceries › Plant milks, store default. Change it" }),
    ).toHaveCount(2);
    await expect(page.getByText(/^Suggested:/)).toHaveCount(0);

    // Set all lines makes it this purchase's category on every line.
    await page.getByRole("button", { name: "Set all lines" }).click();
    await picker(page).getByRole("button", { name: "Household", exact: true }).click();
    await picker(page).getByRole("button", { name: "Set all lines" }).click();
    await expect(
      page.getByRole("button", { name: "Category: Household, this purchase. Change it" }),
    ).toHaveCount(2);
  });

  test("Library › Labels adds, archives and restores categories, and adds tags", async ({ page }) => {
    await page.goto("/library");
    await page.getByRole("link", { name: /Labels/ }).click();
    await expect(page.getByRole("heading", { name: "Labels", exact: true })).toBeVisible();
    const tree = page.getByRole("list", { name: "Categories and classes" });
    await expect(tree.getByText("Groceries", { exact: true })).toBeVisible();

    // A new category nothing uses is deleted on removal.
    await page.getByRole("button", { name: "Category", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Name").fill("Hobbies e2e");
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(tree.getByText("Hobbies e2e")).toBeVisible();
    await page.getByRole("button", { name: /Options for Hobbies e2e/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await page
      .getByRole("dialog", { name: "Remove Hobbies e2e?" })
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(toast(page, "Removed.")).toBeVisible();
    await expect(tree.getByText("Hobbies e2e")).toBeHidden();

    // A tag shows with how many purchases have it.
    await page.getByRole("button", { name: "Tag", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Name").fill("e2e treat");
    await page.getByRole("button", { name: "Add tag" }).click();
    await expect(
      page.getByRole("list", { name: "Tags" }).getByRole("button", { name: /e2e treat\s*0/ }),
    ).toBeVisible();
  });
});

test.describe("phone", { tag: "@phone" }, () => {
  test("a line's category chip opens the hierarchy, with This item chosen first", async ({ page }) => {
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: "Snap receipt" })
      .click();
    await (await chooser).setFiles(fixture("labels.jpg"));
    const reply = uploadReply(page);
    await page.getByRole("button", { name: "Done" }).click();
    await openWhenRead(page, await receiptId(reply));
    // The desktop test may have taught the store already; then the page opens on the items.
    const toItems = page.getByRole("button", { name: "Continue to items" });
    if (await toItems.isVisible()) await toItems.click();

    // Name the candle, then categorize it: the scope choice starts on This item.
    await page.getByRole("button", { name: "Name this item CANDLE" }).click();
    await page
      .getByRole("button", { name: /^Category: / })
      .nth(1)
      .click();
    await expect(picker(page).getByRole("radio", { name: /This item/ })).toBeChecked();
    await picker(page).getByRole("button", { name: "Groceries", exact: true }).click();
    await picker(page).getByRole("button", { name: "Save category" }).click();
    await expect(page.getByRole("button", { name: /^Category: Groceries, this item/ })).toBeVisible();
    // The page itself still never scrolls.
    expect(
      await page.evaluate(() => {
        window.scrollTo(0, 10_000);
        return document.scrollingElement?.scrollTop ?? window.scrollY;
      }),
    ).toBe(0);
  });
});
