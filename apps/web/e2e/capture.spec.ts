// Stage 2 "Done when" checks that a browser can make (docs/feature-plans/capture-and-upload-plan.md).
// One server serves every test, so receipt counts are compared with the count before each test.
// The list is ordered by capture time, which comes from each file's date, so tests find their
// receipts by content rather than by position.
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Response } from "@playwright/test";

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

/** The id of the receipt an upload saved, from the server's reply. */
async function receiptId(response: Promise<Response>): Promise<string> {
  const body = (await (await response).json()) as { json?: { receipt?: { id?: string } } };
  const id = body.json?.receipt?.id;
  if (id === undefined) throw new Error("upload reply has no receipt id");
  return id;
}

const uploadReply = (page: Page) =>
  page.waitForResponse((response) => response.url().includes("/rpc/receipts/put") && response.ok());

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
  test("shows side navigation with the profile and Upload receipt, not the tab bar", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("button", { name: "Upload receipt" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Profile: Pat Tester" })).toBeVisible();
    for (const section of ["Receipts", "Analytics", "Budget", "Library", "Settings"]) {
      await expect(nav.getByRole("link", { name: section, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole("button", { name: "Snap receipt" })).toBeHidden();
  });

  test("three images chosen together become three receipts, logged by the signed-in person", async ({
    page,
  }) => {
    const before = await receiptCount(page);
    await page.getByRole("button", { name: "Upload receipt" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("drop-zone").getByRole("button", { name: "Upload images" }).click();
    const reply = uploadReply(page);
    await (await chooser).setFiles(JPEGS);

    await waitForSaved(page, 3);
    await expect(receiptRows(page)).toHaveCount(before + 3);
    await page.goto(`/receipts/${await receiptId(reply)}`);
    await expect(page.getByText("Logged by Pat Tester").first()).toBeVisible();
    await expect(page.getByRole("img", { name: "Photo 1 of 1" })).toBeVisible();
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
    const reply = uploadReply(page);
    await page.getByRole("button", { name: "Done" }).click();
    await waitForSaved(page);

    await page.getByRole("link", { name: "Receipts", exact: true }).click();
    await expect(receiptRows(page)).toHaveCount(before + 1);
    await page.goto(`/receipts/${await receiptId(reply)}`);

    const images = page.getByRole("group", { name: /Receipt photos/ }).getByRole("img");
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
    const reply = uploadReply(page);
    await page.getByRole("button", { name: "Done" }).click();
    await waitForSaved(page);

    await page.goto(`/receipts/${await receiptId(reply)}`);
    const image = page.getByRole("img", { name: "Photo 1 of 1" });
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800);
  });
});

test.describe("phone", { tag: "@phone" }, () => {
  test("shows the tab bar with Snap, not the side navigation", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    await expect(nav.getByRole("button", { name: "Snap receipt" })).toBeVisible();
    for (const section of ["Receipts", "Analytics", "Library", "Settings"]) {
      await expect(nav.getByRole("link", { name: section, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Upload receipt" })).toBeHidden();
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
