// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { AgentAvailability } from "@stintwork/core";
import { codexProfile } from "../../agents/src/profiles";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { dialogBrief, dialogItem, dialogSnapshot, gate } from "./dialogs.fixture";
import { assertLayout } from "./layout-check";

async function capture(page: Page, testInfo: TestInfo, state: string) {
  const dialog = page.locator('.brief-preview-sheet[data-state="open"]');
  await expect(dialog).toBeVisible();
  await assertLayout(page, { region: ".brief-preview-sheet" });
  await dialog.screenshot({ path: testInfo.outputPath(`${state}.png`) });
}

// Browser-local streaming fake: Playwright route.fulfill buffers a whole response.
async function preparationFake(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let attempt = 0;
    const encoder = new TextEncoder();
    const send = (value: unknown) =>
      controller?.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    const progress = (phase: string, source = attempt === 1 ? "bundled" : "installed") =>
      send({
        type: "preparation",
        stintId: `fixture-${attempt}`,
        progress: {
          phase,
          source,
          reason: source === "bundled" ? "handshake failed" : "compatible",
          executable: {
            path: `/fixture/${"long-directory/".repeat(12)}codex`,
            version: source === "bundled" ? "0.159.3" : "0.163.0",
          },
          adapterVersion: "2.1.1",
        },
      });
    window.addEventListener("fixture-preparation", ((event: CustomEvent<string>) => {
      if (event.detail === "failure" || event.detail === "success") {
        send({
          type: "result",
          status: event.detail === "success" ? 201 : 503,
          body: { reason: "Fixture offline preparation failure. Retry with the same pins." },
        });
        controller?.close();
        controller = undefined;
      } else progress(event.detail);
    }) as EventListener);
    window.fetch = async (input, options) => {
      const url = String(input);
      if (url === "/api/stints") {
        attempt++;
        const body = new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
        });
        options?.signal?.addEventListener(
          "abort",
          () => {
            controller?.close();
            controller = undefined;
          },
          { once: true },
        );
        progress("confirm");
        return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
      }
      if (/\/api\/stints\/fixture-\d+\/confirm-agent$/.test(url)) {
        progress("installing");
        return new Response("{}");
      }
      if (/\/api\/stints\/fixture-\d+\/stop$/.test(url)) {
        send({ type: "result", status: 503, body: { reason: "Cancelled" } });
        controller?.close();
        controller = undefined;
        return new Response("{}", { status: 202 });
      }
      return original(input, options);
    };
  });
}

for (const language of ["en", "zh-CN"] as const) {
  const t = language === "en" ? en : zhCN;
  for (const width of [1440, 1024, 768, 390, 360]) {
    for (const colorScheme of width === 1440 || width === 390
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test.describe(`agent preparation ${width}px ${language} ${colorScheme}`, () => {
        test.beforeEach(async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ colorScheme });
          await page.addInitScript(
            (choice) => localStorage.setItem("stintwork.language", choice),
            language,
          );
          await page.route("**/api/project", (route) => route.fulfill({ json: dialogSnapshot }));
          await page.routeWebSocket("**/api/live", (socket) =>
            socket.send(JSON.stringify(dialogSnapshot)),
          );
        });

        test("local states, loading, source details, keyboard dismissal and focus return", async ({
          page,
        }, testInfo) => {
          const loading = gate();
          let availability: AgentAvailability = {
            available: false,
            kind: "not-prepared",
            canStart: true,
          };
          await page.route("**/api/agents", (route) =>
            route.fulfill({ json: { agents: [{ ...codexProfile, availability }] } }),
          );
          await page.route("**/api/work-items/dialog-item/brief-preview", async (route) => {
            await loading.ready;
            await route.fulfill({ json: dialogBrief });
          });
          await page.goto("/?item=dialog-item");
          const parent = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const trigger = parent.getByRole("button", { name: t.stints.startStint, exact: true });
          const dialog = page.getByRole("dialog", { name: t.stints.briefPreview });
          await trigger.click();
          await expect(dialog.getByText(t.stints.readingBrief)).toBeVisible();
          await capture(page, testInfo, "loading");
          loading.release();
          await expect(
            dialog.getByRole("button", { name: t.stints.start, exact: true }),
          ).toBeEnabled();
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
          for (const state of [
            "not-prepared",
            "missing-executable",
            "login-required",
            "incompatible",
            "preparation-failed",
            "ready",
          ] as const) {
            availability = {
              available: state === "ready",
              canStart: true,
              kind: state === "ready" ? undefined : state,
              selection: {
                source: state === "ready" ? "installed" : "bundled",
                reason: state === "ready" ? "compatible" : "missing",
                executable: {
                  path: `/fixture/${"long-path/".repeat(20)}codex`,
                  version: "0.159.3",
                },
                adapterVersion: "2.1.1",
              },
            };
            await trigger.click();
            await expect(
              dialog.getByText(t.stints.preparation.states[state], { exact: true }),
            ).toBeVisible();
            await expect(
              dialog.getByRole("button", { name: t.stints.start, exact: true }),
            ).toBeEnabled();
            if (state === "login-required")
              await expect(dialog.getByText("codex login", { exact: true })).toBeVisible();
            await capture(page, testInfo, state);
            const picker = dialog.getByRole("combobox", { name: t.stints.agent, exact: true });
            await picker.click();
            await page.keyboard.press("Escape");
            await expect(picker).toBeFocused();
            await expect(dialog).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(trigger).toBeFocused();
          }
        });

        test("bundled notice before download, progress, cancel, failure, retry and actual installed source", async ({
          page,
        }, testInfo) => {
          await preparationFake(page);
          await page.route("**/api/agents", (route) =>
            route.fulfill({
              json: {
                agents: [
                  {
                    ...codexProfile,
                    availability: {
                      available: false,
                      kind: "not-prepared",
                      canStart: true,
                      selection: {
                        source: "bundled",
                        reason: "unverified",
                        adapterVersion: "2.1.1",
                      },
                    },
                  },
                ],
              },
            }),
          );
          await page.route("**/api/work-items/dialog-item/brief-preview", (route) =>
            route.fulfill({ json: dialogBrief }),
          );
          await page.goto("/?item=dialog-item");
          const parent = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const trigger = parent.getByRole("button", { name: t.stints.startStint, exact: true });
          await trigger.click();
          const dialog = page.getByRole("dialog", { name: t.stints.briefPreview });
          await dialog.getByRole("button", { name: t.stints.start, exact: true }).click();
          await expect(
            dialog.getByRole("heading", {
              name: `${t.stints.preparation.source}: ${t.stints.preparation.bundled}`,
              exact: true,
            }),
          ).toBeVisible();
          await expect(dialog.getByText(t.stints.preparation.bundledNotice)).toBeVisible();
          await capture(page, testInfo, "bundled-before-download");
          await dialog.getByRole("button", { name: t.stints.preparation.confirm }).click();
          await expect(
            dialog
              .getByRole("status")
              .filter({ hasText: t.coreText["agent.preparation.installing"] }),
          ).toBeVisible();
          await capture(page, testInfo, "downloading");
          await dialog.getByRole("button", { name: t.stints.preparation.cancel }).click();
          await expect(
            dialog.getByText(t.stints.preparation.cancelled, { exact: true }),
          ).toBeVisible();
          await capture(page, testInfo, "cancelled");
          await dialog.getByRole("button", { name: t.stints.preparation.retry }).click();
          await expect(
            dialog.getByRole("heading", {
              name: `${t.stints.preparation.source}: ${t.stints.preparation.installed}`,
              exact: true,
            }),
          ).toBeVisible();
          await dialog.getByRole("button", { name: t.stints.preparation.confirm }).click();
          await page.evaluate(() =>
            window.dispatchEvent(new CustomEvent("fixture-preparation", { detail: "failure" })),
          );
          await expect(
            dialog.getByRole("alert").filter({ hasText: "Fixture offline preparation failure" }),
          ).toBeVisible();
          await capture(page, testInfo, "failed-retry");
          await dialog.getByRole("button", { name: t.stints.preparation.retry }).click();
          await dialog.getByRole("button", { name: t.stints.preparation.confirm }).click();
          for (const phase of ["verifying", "smoke", "ready"] as const) {
            await page.evaluate(
              (phase) =>
                window.dispatchEvent(new CustomEvent("fixture-preparation", { detail: phase })),
              phase,
            );
            await expect(
              dialog
                .getByRole("status")
                .filter({ hasText: t.coreText[`agent.preparation.${phase}`] }),
            ).toBeVisible();
            await capture(page, testInfo, phase);
          }
          await page.evaluate(() =>
            window.dispatchEvent(new CustomEvent("fixture-preparation", { detail: "success" })),
          );
          await expect(dialog).toBeHidden();
          await expect(trigger).toBeFocused();
        });
      });
    }
  }
}
