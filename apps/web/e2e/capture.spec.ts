// Stage 2 "Done when" checks that a browser can make (docs/feature-plans/capture-and-upload-plan.md).
// One server serves every test, so receipt counts are compared with the count before each test.
// The list is ordered by capture time, which comes from each file's date, so tests find their
// receipts by content rather than by position.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;
const JPEGS = ["receipt-a.jpg", "receipt-b.jpg", "receipt-c.jpg"].map(fixture);
/** Widths of the three JPEG fixtures, in order; the browser keeps them (all under the pixel limit). */
const JPEG_WIDTHS = [600, 640, 700];

async function logIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("e2e");
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible();
}

const receiptRows = (page: Page) => page.getByRole("list", { name: "Receipts" }).getByRole("listitem");

async function receiptCount(page: Page): Promise<number> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible();
  // Either the list or the empty state shows once loading is done.
  await expect(
    page.getByRole("list", { name: "Receipts" }).or(page.getByText("No receipts yet")),
  ).toBeVisible();
  return receiptRows(page).count();
}

async function waitForSaved(page: Page, times = 1) {
  await expect(page.getByRole("status").filter({ hasText: "Receipt saved." })).toHaveCount(times, {
    timeout: 30_000,
  });
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
});

// Each project in playwright.config.ts runs only the tests tagged for its layout.
test.describe("desktop", { tag: "@desktop" }, () => {
  test("shows side navigation, not the tab bar", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("button", { name: "Upload images" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Snap receipt" })).toBeHidden();
  });

  test("three images chosen together become three receipts, logged by the signed-in person", async ({
    page,
  }) => {
    const before = await receiptCount(page);
    await page.getByRole("button", { name: "Upload images" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("drop-zone").getByRole("button", { name: "Upload images" }).click();
    await (await chooser).setFiles(JPEGS);

    await waitForSaved(page, 3);
    await expect(receiptRows(page)).toHaveCount(before + 3);
    const singles = receiptRows(page).filter({ hasText: "Pat Tester · 1 photo" });
    expect(await singles.count()).toBeGreaterThanOrEqual(3);
  });

  test("a long receipt in three photos with Add another photo becomes one receipt, in order", async ({
    page,
  }) => {
    const before = await receiptCount(page);
    await page.goto("/capture");
    for (const [index, file] of JPEGS.entries()) {
      const chooser = page.waitForEvent("filechooser");
      const button =
        index === 0
          ? page.getByTestId("drop-zone").getByRole("button", { name: "Upload images" })
          : page.getByRole("button", { name: "Add another photo" });
      await button.click();
      await (await chooser).setFiles(file);
      await expect(
        page.getByRole("list", { name: "Photos of this receipt" }).getByRole("listitem"),
      ).toHaveCount(index + 1);
    }
    await page.getByRole("button", { name: "Done" }).click();
    await waitForSaved(page);

    await page.getByRole("link", { name: "Receipts", exact: true }).click();
    await expect(receiptRows(page)).toHaveCount(before + 1);
    await receiptRows(page).filter({ hasText: "3 photos" }).first().click();

    const images = page.getByRole("list", { name: "Photos of this receipt" }).getByRole("img");
    await expect(images).toHaveCount(3);
    for (const [index, width] of JPEG_WIDTHS.entries()) {
      const image = images.nth(index);
      await expect(image).toHaveAccessibleName(`Photo ${index + 1} of 3`);
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(width);
    }
  });

  test("a HEIC file dragged in uploads, is converted, and displays", async ({ page }) => {
    await page.goto("/capture");
    const heic = readFileSync(fixture("receipt.heic")).toString("base64");
    const dataTransfer = await page.evaluateHandle((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      // Chrome on a desktop can't decode HEIC, so the original goes to the server (SPEC.md §6.1).
      transfer.items.add(new File([bytes], "IMG_0001.HEIC", { type: "image/heic" }));
      return transfer;
    }, heic);
    await page.getByTestId("drop-zone").dispatchEvent("drop", { dataTransfer });
    await expect(page.getByText("No preview; uploads as is")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await waitForSaved(page);

    // A file made in the page is dated now, so this receipt is the newest.
    await page.getByRole("link", { name: "Receipts", exact: true }).click();
    // Thumbnails are decorative (alt=""), so they're found as elements, not by role.
    const thumbnail = receiptRows(page).first().locator("img");
    await expect
      .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await receiptRows(page).first().click();
    const image = page.getByRole("img", { name: "Photo 1 of 1" });
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800);
  });
});

test.describe("phone", { tag: "@phone" }, () => {
  test("shows the tab bar with Snap, not the side navigation", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("button", { name: "Snap receipt" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Upload images" })).toBeHidden();
  });

  test("Snap takes a photo, and Done uploads it as a receipt", async ({ page }) => {
    const before = await receiptCount(page);
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: "Snap receipt" })
      .click();
    await (await chooser).setFiles(JPEGS[0] ?? "");
    await expect(page.getByRole("heading", { name: "New receipt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add another photo" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await waitForSaved(page);

    await page.getByRole("link", { name: "Receipts", exact: true }).click();
    await expect(receiptRows(page)).toHaveCount(before + 1);
    await expect(receiptRows(page).filter({ hasText: "Pat Tester · 1 photo" }).first()).toBeVisible();
  });

  test("leaving the capture screen uploads the open receipt", async ({ page }) => {
    const before = await receiptCount(page);
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: "Snap receipt" })
      .click();
    await (await chooser).setFiles(JPEGS[1] ?? "");
    await expect(page.getByRole("heading", { name: "New receipt" })).toBeVisible();
    await page.getByRole("link", { name: "Receipts", exact: true }).click();
    await waitForSaved(page);
    await expect(receiptRows(page)).toHaveCount(before + 1);
  });
});
