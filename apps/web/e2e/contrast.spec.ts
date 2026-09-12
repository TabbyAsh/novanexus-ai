import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("missing values, explicit bins, cost edits and history edits recompute", async ({
  page,
}) => {
  await page.goto("/lab/contrast");
  await page.getByLabel("Input AB", { exact: true }).fill("BA");
  await expect(
    page.getByLabel("A before B for AB", { exact: true }),
  ).toHaveText("0");
  await expect(
    page.getByLabel("B before A for AB", { exact: true }),
  ).toHaveText("1");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Measurement 1 for case1").fill("red");
  await page.getByRole("button", { name: "+ Add expectation" }).click();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(
    page.getByText("Insufficient evidence:", { exact: false }),
  ).toBeVisible();
  await page.getByText("Edit measurement & channels").click();
  await page.getByLabel("Kind measurement1").selectOption("numeric-bins");
  await page.getByLabel("Bins measurement1").fill("10, 20");
  await page.getByLabel("Bins measurement1").blur();
  await page.getByLabel("Measurement 1 for case1").fill("9");
  await page.getByLabel("Measurement 1 for case2").fill("10");
  await page.getByLabel("Cost measurement1").fill("0");
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("STALE · RERUN TO EXPORT")).toHaveCount(0);
  await expect(
    page.getByText("Insufficient evidence:", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export analysis bundle" }),
  ).toBeEnabled();
  await page.getByText("Decoder · vectors, ambiguity & unknowns").click();
  await page.getByLabel("Decode vector public").fill('["bin:0"]');
  await expect(
    page.getByText('"status":"unique"', { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Measurement 1 for case2").fill("oops");
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "finite number" }),
  ).toBeVisible();
});

test("real route, simulation, stale state, export/import and decoder round trip", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Contrast Lab", exact: true }).click();
  await expect(page).toHaveURL(/\/lab\/contrast$/);
  await expect(
    page.getByRole("heading", { name: "Test the differences that matter." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("A before B for AB", { exact: true }),
  ).toHaveText("1");
  await expect(
    page.getByLabel("B before A for AB", { exact: true }),
  ).toHaveText("0");
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(
    page.getByText("Analysis complete.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Collision: identical recorded values", { exact: false }),
  ).toHaveCount(4);
  await page.screenshot({
    path: testInfo.outputPath("01-incomplete.png"),
    fullPage: true,
  });
  await page.getByLabel("Enable A before B", { exact: true }).check();
  await expect(
    page.getByText("Inputs changed · previous results are stale"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export analysis bundle" }),
  ).toBeDisabled();
  await page.getByLabel("Enable B before A", { exact: true }).check();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(
    page.getByText("Collision: identical recorded values", { exact: false }),
  ).toHaveCount(1);
  await expect(page.getByText("ABA ↔ BAB · r4")).toBeVisible();
  await page.getByText("Decoder · vectors, ambiguity & unknowns").click();
  await page.getByLabel("Decode vector inspection").fill("[true,true]");
  await expect(
    page.getByText('"status":"ambiguous"', { exact: false }),
  ).toBeVisible();
  const projectDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const saved = await projectDownload;
  const projectPath = testInfo.outputPath("roundtrip.project.json");
  await saved.saveAs(projectPath);
  const bundleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export analysis bundle" }).click();
  const bundlePath = testInfo.outputPath("analysis.bundle.json");
  await (await bundleDownload).saveAs(bundlePath);
  const bundle = JSON.parse(await fs.readFile(bundlePath, "utf8"));
  expect(bundle.analysis.channels[0].covered).toEqual(["r1", "r2", "r3"]);
  expect(bundle.provenance.execution.tests).toBe("not-executed");
  const reportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download readable report" }).click();
  const reportPath = testInfo.outputPath("downloaded-report.md");
  await (await reportDownload).saveAs(reportPath);
  expect(await fs.readFile(reportPath, "utf8")).toContain("UNCOVERED r4");
  const testsDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download executable tests" }).click();
  const testsPath = testInfo.outputPath("downloaded-requirements.test.ts");
  await (await testsDownload).saveAs(testsPath);
  expect(await fs.readFile(testsPath, "utf8")).toBe(
    bundle.files["requirements.test.ts"],
  );
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Import project file").setInputFiles(projectPath);
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("ABA ↔ BAB · r4")).toBeVisible();
  await expect(
    page.getByText("minimum cost for coverable pairs"),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("02-completed.png"),
    fullPage: true,
  });
  await page
    .getByText("Save on this device, JSON import & computational limits")
    .click();
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByLabel("Enable A before B", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByText("Save on this device, JSON import & computational limits")
    .click();
  await page.getByRole("button", { name: "Load device save" }).click();
  await expect(
    page.getByLabel("Enable A before B", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Delete device save" }).click();
  await expect(
    page.getByRole("button", { name: "Load device save" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("custom project can be built without JSON and survives export/import", async ({
  page,
}, testInfo) => {
  const sensitive = "private-case-content-47802";
  const leaked: string[] = [];
  page.on("request", (req) => {
    if ((req.url() + (req.postData() || "")).includes(sensitive))
      leaked.push(req.url());
  });
  await page.goto("/lab/contrast");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Custom light signals");
  await page.getByLabel("Case name case1").fill(sensitive);
  await page.getByLabel("Measurement 1 for case1").fill("red");
  await page.getByLabel("Measurement 1 for case2").fill("blue");
  await page.getByRole("button", { name: "+ Add expectation" }).click();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("MODEL ANALYSIS", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Collision: identical recorded values", { exact: false }),
  ).toHaveCount(0);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const file = testInfo.outputPath("custom.json");
  await (await pending).saveAs(file);
  await page
    .getByRole("button", { name: "Sequence Witness", exact: true })
    .click();
  await page.getByLabel("Import project file").setInputFiles(file);
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("MODEL ANALYSIS", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Measurement 1 for case2")).toHaveValue("blue");
  expect(leaked).toEqual([]);
});

test("contradiction witnesses, rejected channel observations, invalid imports and responsive layout", async ({
  page,
}, testInfo) => {
  await page.goto("/lab/contrast");
  await page.getByRole("button", { name: "Contradiction example" }).click();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText("Contradiction · apart")).toBeVisible();
  await expect(
    page.getByText("same1 → same2", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Channel example" }).click();
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(
    page.getByText("Rejected · reveals a difference", { exact: false }),
  ).toBeVisible();
  await page
    .getByText("Save on this device, JSON import & computational limits")
    .click();
  await page
    .getByLabel("Project JSON import")
    .fill('{"schemaVersion":"future"}');
  await page.getByRole("button", { name: "Import pasted JSON" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unsupported schemaVersion" }),
  ).toContainText("Unsupported schemaVersion");
  await page.getByLabel("Import project file").setInputFiles({
    name: "oversized.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1000001, " "),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "exceeds" }),
  ).toContainText("exceeds");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Sequence Witness", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("03-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Run analysis" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Analysis complete.", { exact: false }),
  ).toBeVisible();
});
