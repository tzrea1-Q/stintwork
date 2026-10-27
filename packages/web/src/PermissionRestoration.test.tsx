// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { PermissionAnswer } from "./PermissionAnswer";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { en } from "./i18n/en";
import { zhCN } from "./i18n/zh-CN";

const request = {
  requestId: "same-id",
  attemptId: "old",
  binding: "reconnecting" as "reconnecting" | "live",
  details: '{"command":"echo test"}',
  options: [
    { optionId: "yes", name: "Yes", kind: "allow_once" },
    { optionId: "no", name: "No", kind: "reject_once" },
  ],
};
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test.each(["en", "zh-CN"])(
  "%s disables restored answers, binds keyboard consent to the current attempt and waits for delivery",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const t = language === "en" ? en : zhCN;
    let delivered!: () => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          delivered = () => resolve(Response.json({}));
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const view = render(
      <LanguageProvider>
        <PermissionAnswer stintId="stint" request={request} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(t.needsYou.reconnectingPermission);
    expect(screen.getByRole("button", { name: /Yes/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /No/ })).toBeDisabled();
    const live = { ...request, binding: "live" as const, attemptId: "new" };
    view.rerender(
      <LanguageProvider>
        <PermissionAnswer stintId="stint" request={live} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(t.needsYou.waitingPermission);
    const user = userEvent.setup();
    screen.getByRole("button", { name: /Yes/ }).focus();
    await user.keyboard("{Enter}");
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: '{"optionId":"yes","attemptId":"new"}' }),
    );
    expect(screen.getByRole("button", { name: /No/ })).toBeDisabled();
    delivered();
    expect(await screen.findByText(t.needsYou.answerSent)).toBeVisible();
    // A reused ID in another attempt must not inherit submitted state.
    view.rerender(
      <LanguageProvider>
        <PermissionAnswer stintId="stint" request={{ ...live, attemptId: "newer" }} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("button", { name: /No/ })).toBeEnabled();
  },
);

test.each(["en", "zh-CN"])(
  "%s translates the attempt-required permission refusal",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const t = language === "en" ? en : zhCN;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            reason: "Include the current attemptId to answer this permission request.",
            reasonMessage: { code: "permission.attemptRequired" },
          },
          { status: 400 },
        ),
      ),
    );
    render(
      <LanguageProvider>
        <PermissionAnswer stintId="stint" request={{ ...request, binding: "live" }} />
      </LanguageProvider>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /No/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.coreText["permission.attemptRequired"],
    );
  },
);
