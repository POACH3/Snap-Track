// Stage 4 part 1 "Done when" checks that a browser can make (docs/feature-plans/store-review-plan.md).
// The e2e server's stand-in for the LLM server replies by photo width (apps/server/src/testing/
// e2e-extractor.ts), so each test uploads its own fixture and finds its receipt by the id the
// upload returns. Stores created here stay for the rest of the run, so names are unique per test.
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

/** Uploads one photo as its own receipt from the desktop capture screen; returns its id. */
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

/** Opens a receipt's page once the stand-in model has read it (the page checks back while it is being read). */
async function openWhenRead(page: Page, id: string) {
  await page.goto(`/receipts/${id}`);
  await expect(page.getByText("This receipt is still being read")).toBeHidden({ timeout: 20_000 });
}

const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

test.describe("desktop", { tag: "@desktop" }, () => {
  test("a store confirmed once is matched on the next receipt; the confirmed one reopens as a digital receipt", async ({
    page,
  }) => {
    const first = await uploadOnDesktop(page, "review-a.jpg");
    await openWhenRead(page, first);

    // Store needs confirmation: the receipt's name is offered, but nothing is saved until Confirm.
    await expect(page.getByRole("heading", { name: "Fresh Mart" })).toBeVisible();
    await expect(page.getByText(/The receipt says FRESH MART #12/)).toBeVisible();
    await expect(page.getByRole("img", { name: "Photo 1 of 1" })).toBeVisible();
    // The name the receipt shows is offered, already chosen: a correct one needs no typing.
    await expect(page.getByRole("button", { name: /Create "Fresh Mart"/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // A line with no item offers the model's readable name; Name item names it on confirm.
    await page.getByRole("button", { name: "Name this item Whole milk, 1 gal" }).click();
    await expect(page.getByRole("button", { name: /Whole milk, 1 gal/ })).toBeVisible();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(toast(page, "Receipt confirmed.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible();

    // The confirmed row expands in place into the digital receipt.
    const row = page.getByRole("list", { name: "Receipts" }).getByRole("button", { name: /Fresh Mart/ });
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    const items = page.getByRole("list", { name: "Items" });
    await expect(items.getByText("Whole milk, 1 gal")).toBeVisible();
    await expect(items.getByText("SOURDOUGH LOAF")).toBeVisible();
    await expect(page.getByText("Visa credit ···· 4821")).toBeVisible();
    await page.getByRole("link", { name: "View receipt image" }).click();

    // The receipt page, read-only until Edit, with the photo beside the data.
    await expect(page.getByRole("heading", { name: "Fresh Mart" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(page.getByLabel("Total", { exact: true })).toBeDisabled();
    await expect(page.getByRole("img", { name: "Photo 1 of 1" })).toBeVisible();

    // Another location sharing only the website is matched automatically.
    const second = await uploadOnDesktop(page, "review-b.jpg");
    await openWhenRead(page, second);
    await expect(page.getByRole("heading", { name: "Fresh Mart" })).toBeVisible();
    await expect(page.getByText(/Matched by website freshmart\.example/)).toBeVisible();
    // Its milk is printed differently but has the same code, so it shows the item's name.
    await expect(page.getByRole("button", { name: "Whole milk, 1 gal" })).toBeVisible();

    // Library › Stores shows what it is recognized by.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).click();
    await page.getByRole("link", { name: /Stores/ }).click();
    await page.getByRole("link", { name: /Fresh Mart/ }).click();
    const identifiers = page.getByRole("list", { name: "Identifiers" });
    await expect(identifiers.getByText("(555) 010-2000")).toBeVisible();
    await expect(identifiers.getByText("freshmart.example")).toBeVisible();

    // Library › Items: renaming shows on every purchase at once.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).click();
    await page.getByRole("link", { name: /Items/ }).click();
    await page.getByRole("link", { name: /Whole milk, 1 gal/ }).click();
    await expect(page.getByRole("list", { name: "Identifiers" }).getByText("4417")).toBeVisible();
    await expect(page.getByRole("list", { name: "Purchases" }).getByRole("listitem")).toHaveCount(2);
    await page.getByLabel("Name", { exact: true }).fill("Milk");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(toast(page, "Item renamed.")).toBeVisible();
    await page.goto(`/receipts/${second}`);
    await expect(page.getByRole("button", { name: "Milk", exact: true })).toBeVisible();
  });

  test("a review-required receipt is typed in by hand; the total is required, and leaving asks first", async ({
    page,
  }) => {
    const id = await uploadOnDesktop(page, "review-unreadable.jpg");
    await openWhenRead(page, id);
    await expect(page.getByRole("heading", { name: "Review receipt" })).toBeVisible();

    // Nothing was read, so there is no name to offer: it is typed.
    await expect(page.getByRole("button", { name: /Create "/ })).toHaveCount(0);
    await page.getByPlaceholder("Search, or type a new store's name").fill("Test Kitchen");
    await page.getByRole("button", { name: /Create "Test Kitchen"/ }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText("Enter the total.")).toBeVisible();

    // Unsaved changes: leaving asks, and Keep editing stays.
    await page.getByLabel("Total", { exact: true }).fill("12.50");
    await page.getByRole("link", { name: "Receipts", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Discard your changes?" })).toBeVisible();
    await page.getByRole("button", { name: "Keep editing" }).click();

    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(toast(page, "Receipt confirmed.")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Receipts" }).getByRole("button", { name: /Test Kitchen/ }),
    ).toBeVisible();
  });
});

test.describe("phone", { tag: "@phone" }, () => {
  test("the edit card and the photo are both on screen; store first, then items and totals", async ({
    page,
  }) => {
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: "Snap receipt" })
      .click();
    await (await chooser).setFiles(fixture("review-phone.jpg"));
    const reply = uploadReply(page);
    await page.getByRole("button", { name: "Done" }).click();
    await openWhenRead(page, await receiptId(reply));

    // The page itself never scrolls; only the edit card's body does.
    const pageScrolls = () =>
      page.evaluate(() => {
        window.scrollTo(0, 10_000);
        return document.scrollingElement?.scrollTop ?? window.scrollY;
      });
    expect(await pageScrolls()).toBe(0);

    // No tab bar here; the edit card holds the actions.
    await expect(page.getByRole("button", { name: "Snap receipt" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "Store", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Photo 1 of 1" })).toBeInViewport();
    // The detected name is already chosen, so Continue works without typing.
    await expect(page.getByRole("button", { name: /Create "Corner Market"/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Continue to items" }).click();

    await expect(page.getByRole("heading", { name: "Items & totals" })).toBeVisible();
    expect(await pageScrolls()).toBe(0);
    await expect(page.getByRole("img", { name: "Photo 1 of 1" })).toBeInViewport();
    const warning = page.getByText("The items add up to $5.00, but the subtotal says $6.00.");
    await expect(warning).toBeVisible();

    // Fixing the misread line clears the warning, checked by the server as you type.
    await page.getByLabel("Amount charged").nth(1).fill("3.00");
    await expect(warning).toBeHidden({ timeout: 5_000 });

    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(toast(page, "Receipt confirmed.")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Receipts" }).getByRole("button", { name: /Corner Market/ }),
    ).toBeVisible();
  });
});
