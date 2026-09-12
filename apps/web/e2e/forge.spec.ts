import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import workshop from "../src/lib/instrument/examples/workshop.json";
import capacity from "../src/lib/instrument/examples/capacity.json";

test("edit process capacity, then operate the actual downloaded HTML offline", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("link", { name: "Instrument Forge", exact: true })
    .click();
  await expect(page).toHaveURL(/\/lab\/forge$/);
  await expect(page.locator('[data-output="bottleneck"]')).toHaveText("4");
  await expect(page.locator('[data-output="shiftOutput"]')).toHaveText("32");
  await expect(page.locator('[data-output="shortfall"]')).toHaveText("4");
  await page.screenshot({
    path: info.outputPath("01-capacity.png"),
    fullPage: true,
  });
  await page.getByLabel("Prepare", { exact: true }).fill("100");
  await expect(page.locator('[data-output="bottleneck"]')).toHaveText("4");
  await page.getByLabel("Assemble", { exact: true }).fill("6");
  await expect(page.locator('[data-output="bottleneck"]')).toHaveText("5");
  await expect(page.locator('[data-output="shiftOutput"]')).toHaveText("40");
  await page.getByLabel("Assemble", { exact: true }).fill("");
  await expect(page.locator('[data-output="bottleneck"]')).toHaveText("—");
  await expect(
    page.getByRole("button", { name: "Download offline calculator" }),
  ).toBeDisabled();
  await page.getByLabel("Assemble", { exact: true }).fill("6");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download offline calculator" })
    .click();
  const html = info.outputPath("capacity-offline.html");
  await (await download).saveAs(html);
  const offlineContext = await browser.newContext({ offline: true });
  const offline = await offlineContext.newPage();
  const requests: string[] = [];
  offline.on("request", (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  offline.on("pageerror", (error) => errors.push(error.message));
  await offline.goto(pathToFileURL(html).href);
  await expect(offline.locator('[data-output="bottleneck"]')).toHaveText("5");
  await offline.getByLabel("Pack · units / hour", { exact: true }).fill("2");
  await expect(offline.locator('[data-output="bottleneck"]')).toHaveText("2");
  await expect(offline.locator('[data-output="shiftOutput"]')).toHaveText("16");
  await offline.screenshot({
    path: info.outputPath("02-offline-calculator.png"),
    fullPage: true,
  });
  await offline.getByRole("button", { name: "Reset defaults" }).click();
  await expect(offline.locator('[data-output="bottleneck"]')).toHaveText("4");
  const offlineJson = offline.waitForEvent("download");
  await offline.getByRole("button", { name: "Export JSON" }).click();
  const savedJson = info.outputPath("offline-saved.instrument.json");
  await (await offlineJson).saveAs(savedJson);
  expect(JSON.parse(await fs.readFile(savedJson, "utf8")).values.assemble).toBe(
    4,
  );
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await offlineContext.close();
});

test("import a different specification, recompute, handle failure and round-trip current values", async ({
  page,
  browser,
}, info) => {
  await page.goto("/lab/forge");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import specification", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "workshop.spec.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(workshop)),
  });
  await expect(
    page.getByRole("heading", { name: "Will this workshop cover its costs?" }),
  ).toBeVisible();
  await expect(page.locator('[data-output="remaining"]')).toHaveText("300");
  await expect(page.locator('[data-output="breakEven"]')).toHaveText("20");
  await page.getByLabel("Paid attendees", { exact: true }).fill("10");
  await expect(page.locator('[data-output="remaining"]')).toHaveText("-150");
  await page.getByLabel("Ticket price", { exact: true }).fill("10");
  await expect(page.locator('[data-output="remaining"]')).toHaveText("—");
  await expect(
    page
      .getByRole("region", { name: "Calculated result" })
      .getByText("Ticket price must exceed cost per attendee", {
        exact: false,
      }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("03-invalid-assumption.png"),
    fullPage: true,
  });
  await page.getByLabel("Ticket price", { exact: true }).fill("25");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const jsonPath = info.outputPath("workshop-current.instrument.json");
  await (await pending).saveAs(jsonPath);
  await page
    .getByRole("button", { name: "Process capacity", exact: true })
    .click();
  await page.getByLabel("Import calculator file").setInputFiles(jsonPath);
  await expect(page.getByLabel("Paid attendees", { exact: true })).toHaveValue(
    "10",
  );
  await expect(page.locator('[data-output="remaining"]')).toHaveText("-150");
  const pendingHtml = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download HTML", exact: true })
    .click();
  const htmlPath = info.outputPath("workshop-offline.html");
  await (await pendingHtml).saveAs(htmlPath);
  const context = await browser.newContext({ offline: true });
  const offline = await context.newPage();
  await offline.goto(pathToFileURL(htmlPath).href);
  await expect(offline.locator('[data-output="remaining"]')).toHaveText("-150");
  await offline
    .getByLabel("Paid attendees · units", { exact: true })
    .fill("40");
  await expect(offline.locator('[data-output="remaining"]')).toHaveText("300");
  await context.close();
  await page
    .getByText("Bring a different calculator specification", { exact: true })
    .click();
  const guide = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download specification guide" })
    .click();
  const guidePath = info.outputPath("specification-guide.md");
  await (await guide).saveAs(guidePath);
  expect(await fs.readFile(guidePath, "utf8")).toContain("nova-instrument/1");
  const specDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download current specification" })
    .click();
  const specPath = info.outputPath("workshop.spec.json");
  await (await specDownload).saveAs(specPath);
  expect(JSON.parse(await fs.readFile(specPath, "utf8")).id).toBe(
    "workshop-budget",
  );
});

test("a third independent model works through pasted JSON; imports remain data", async ({
  page,
  browser,
}, info) => {
  const marker = "private-calculator-72813";
  const leaked: string[] = [];
  const dialogs: string[] = [];
  page.on("request", (r) => {
    if ((r.url() + (r.postData() || "")).includes(marker)) leaked.push(r.url());
  });
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  const custom = {
    schemaVersion: "nova-instrument/1",
    id: "time-cost",
    title: marker + ' </script><img src=x onerror="alert(1)">',
    description: "Cost for a fixed hourly rate.",
    assumptions: ["Rate does not change with duration."],
    inputs: [
      {
        id: "hours",
        label: "Hours",
        type: "number",
        unit: "h",
        default: 4,
        min: 0,
        max: 24,
        step: 1,
        help: "Duration.",
      },
      {
        id: "rate",
        label: "Hourly rate",
        type: "number",
        unit: "USD/h",
        default: 30,
        min: 0,
        max: 1000,
        step: 1,
        help: "USD per hour.",
      },
    ],
    outputs: [
      {
        id: "cost",
        label: "Cost",
        unit: "USD",
        expression: {
          op: "multiply",
          args: [{ ref: "hours" }, { ref: "rate" }],
        },
        precision: 2,
        help: "Hours times rate.",
      },
    ],
    constraints: [],
  };
  await page.goto("/lab/forge");
  await page
    .getByText("Bring a different calculator specification", { exact: true })
    .click();
  await page
    .getByLabel("Paste specification JSON")
    .fill(JSON.stringify(custom));
  await page.getByRole("button", { name: "Import pasted JSON" }).click();
  await expect(page.locator('[data-output="cost"]')).toHaveText("120");
  await page.getByLabel("Hours", { exact: true }).fill("2");
  await expect(page.locator('[data-output="cost"]')).toHaveText("60");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download HTML", exact: true })
    .click();
  const html = info.outputPath("custom-safe-offline.html");
  await (await pending).saveAs(html);
  const context = await browser.newContext({ offline: true });
  const offline = await context.newPage();
  offline.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  await offline.goto(pathToFileURL(html).href);
  await expect(offline.locator('[data-output="cost"]')).toHaveText("60");
  await expect(offline.locator("img")).toHaveCount(0);
  await context.close();
  await page
    .getByLabel("Paste specification JSON")
    .fill('{"schemaVersion":"future"}');
  await page.getByRole("button", { name: "Import pasted JSON" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unsupported schemaVersion" }),
  ).toBeVisible();
  await expect(page.locator('[data-output="cost"]')).toHaveText("60");
  await page
    .getByLabel("Import calculator file")
    .setInputFiles({
      name: "too-big.json",
      mimeType: "application/json",
      buffer: Buffer.alloc(200001, " "),
    });
  await expect(
    page.getByRole("alert").filter({ hasText: "200 KB" }),
  ).toBeVisible();
  expect(leaked).toEqual([]);
  expect(dialogs).toEqual([]);
});

test("explicit device save, reset, delete and mobile keyboard controls", async ({
  page,
}, info) => {
  await page.goto("/lab/forge");
  await page.getByLabel("Assemble", { exact: true }).fill("6");
  await page.getByText("Optional device save", { exact: true }).click();
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Assemble", { exact: true })).toHaveValue("4");
  await page.getByText("Optional device save", { exact: true }).click();
  await page.getByRole("button", { name: "Load device save" }).click();
  await expect(page.locator('[data-output="bottleneck"]')).toHaveText("5");
  await page.getByRole("button", { name: "Delete device save" }).click();
  await expect(
    page.getByRole("button", { name: "Load device save" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reset defaults" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-output="bottleneck"]')).toHaveText("4");
  await page
    .getByRole("button", { name: "Workshop budget", exact: true })
    .click();
  await expect(page.locator('[data-output="remaining"]')).toHaveText("300");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("04-mobile-workshop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Process capacity", exact: true })
    .click();
  await page.getByText("Inspect formulas & checks", { exact: true }).click();
  await expect(
    page.getByText("min(Prepare, Assemble, Pack)", { exact: true }),
  ).toBeVisible();
  await page.getByText("What this assumes", { exact: true }).click();
  await expect(
    page.getByText(capacity.assumptions[0], { exact: true }),
  ).toBeVisible();
});
