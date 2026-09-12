import { chromium, expect } from "@playwright/test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../server/index.js";
const dir = await mkdtemp(join(tmpdir(), "samplio-browser-"));
const { app, db } = await createApp({ dataDir: dir });
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1150 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const screenshots = resolve("docs/screenshots");
  await mkdir(screenshots, { recursive: true });
  const shot = async (name) => {
    await page.locator(".toast").waitFor({ state: "hidden" });
    await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate(() => document.fonts.ready);
    await page.locator("img").evaluateAll((imgs) =>
      Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((r) => {
                img.onload = r;
                img.onerror = r;
              }),
        ),
      ),
    );
    await page.screenshot({
      path: join(screenshots, name + ".png"),
      fullPage: !(await page.locator("dialog[open]").count()),
    });
    if (!name.endsWith("-zh")) {
      const remaining = await page.locator("body").innerText();
      if (/[\u3400-\u9fff]/.test(remaining.replaceAll("中文", "")))
        throw new Error(
          "Untranslated English screenshot: " +
            name +
            " / " +
            remaining.match(/[\u3400-\u9fff]+/g)?.join(","),
        );
    }
  };
  const nav = async (label) =>
    page.locator("nav").getByRole("button", { name: label }).click();
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Sign in to Samplio" }),
  ).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.getByText("演示账号", { exact: true })).toHaveCount(0);
  await shot("01-login");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("Samplio2026!");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: /Yu.an Lin/ })).toBeVisible();
  await expect(page.locator(".sample-card")).toHaveCount(4);
  await shot("02-dashboard");
  await nav("Sample library");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await shot("03-library");
  await nav("Smart intake");
  await page.locator("input[type=file]").setInputFiles("public/demo/5.webp");
  await expect(page.getByAltText("Sample preview")).toBeVisible();
  await page
    .getByLabel("Sample name")
    .fill("Linen table lamp · Spring edition");
  await page.getByLabel("Category", { exact: true }).selectOption("灯具");
  await page.getByLabel("Main color").fill("Ivory");
  await page.getByLabel("Length / cm").fill("28");
  await page.getByLabel("Width / cm").fill("28");
  await page.getByLabel("Height / cm").fill("45");
  await page
    .getByLabel("Notes")
    .fill(
      "A softly diffused light with a linen shade, designed for bedrooms and reading corners. Review light consistency, base stability and production cost.",
    );
  await shot("04-intake");
  await page.getByRole("button", { name: "Save sample", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sample library", exact: true }),
  ).toBeVisible();
  const row = page
    .locator("tr")
    .filter({ hasText: "Linen table lamp · Spring edition" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Publish sample" }).click();
  await expect(
    page.getByRole("heading", { name: "Publish to review space" }),
  ).toHaveCount(0);
  await row.getByRole("button", { name: "View details" }).click();
  await expect(
    page.getByRole("heading", { name: "Sample details" }),
  ).toBeVisible();
  await page
    .locator(".interaction-buttons")
    .getByRole("button", { name: /Likes/ })
    .click();
  await page
    .locator(".interaction-buttons")
    .getByRole("button", { name: /Saves/ })
    .click();
  await page
    .getByLabel("Review suggestion")
    .fill(
      "The diffused light feels inviting. Consider warm and cool temperature options, and test heat dissipation during extended use.",
    );
  await page.getByRole("button", { name: "Post suggestion" }).click();
  await expect(page.locator(".comment")).toHaveCount(1);
  await shot("05-review-detail");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await nav("Review space");
  await expect(page.locator(".sample-card")).toHaveCount(9);
  await shot("06-review-square");
  await nav("Smart search");
  await page
    .getByRole("button", { name: "Image similarity", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles("public/demo/5.webp");
  await page.getByRole("button", { name: "Search by image" }).click();
  await expect(page.locator(".similarity").first()).toBeVisible();
  await shot("07-image-search");
  await nav("Team favorites");
  await expect(page.locator("tbody tr")).toHaveCount(9);
  await shot("08-rankings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export rankings" }).click();
  const download = await downloadPromise;
  await expect(download.suggestedFilename()).toBe("samplio.xlsx");
  await nav("Administration");
  await expect(
    page.getByRole("heading", { name: "Codes & search" }),
  ).toBeVisible();
  await shot("09-administration");
  await nav("My workspace");
  await expect(
    page.getByRole("heading", { name: "My workspace" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Saved samples", exact: true })
    .click();
  await expect(page.locator(".sample-card")).not.toHaveCount(0);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "个人中心", exact: true }),
  ).toBeVisible();
  await nav("工作台");
  await shot("11-dashboard-zh");
  await nav("喜欢度榜单");
  await expect(page.locator("tbody tr")).toHaveCount(9);
  await shot("12-rankings-zh");
  await page.reload();
  await expect(page.getByRole("heading", { name: /林予安/ })).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Yu.an Lin/ })).toBeVisible();
  // Mobile navigation, layout and forms remain usable without body overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await nav("Overview");
  await expect(page.locator(".sample-card")).toHaveCount(4);
  await shot("10-mobile");
  let overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) throw new Error("Mobile document overflows horizontally");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await nav("Smart intake");
  overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) throw new Error("Mobile intake overflows horizontally");
  // Login display stays clean, and employee role cannot see the admin navigation.
  await page.setViewportSize({ width: 1600, height: 1150 });
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("chen");
  await page.getByLabel("Password", { exact: true }).fill("Samplio2026!");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("heading", { name: /Siyuan Chen/ }),
  ).toBeVisible();
  await expect(
    page.locator("nav").getByRole("button", { name: "Administration" }),
  ).toHaveCount(0);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "PASS: login, clean credentials UI, create, publish, reactions, comments, similarity, rankings, XLSX download, mobile overflow, employee role.",
  );
  console.log("Saved 12 real product screenshots in docs/screenshots.");
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  db.close();
  await rm(dir, { recursive: true, force: true });
}
