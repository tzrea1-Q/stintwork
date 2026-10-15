// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import { SelectField } from "./SelectField";

test("a field selects by keyboard, skips unavailable options and returns focus", async () => {
  const user = userEvent.setup();
  function Field() {
    const [value, setValue] = useState("");
    return (
      <SelectField
        aria-label="Milestone"
        value={value}
        onValueChange={setValue}
        options={[
          { value: "", label: "No milestone" },
          { value: "blocked", label: "Unavailable", disabled: true },
          { value: "__empty__", label: "Long milestone 中文" },
        ]}
      />
    );
  }
  render(<Field />);
  const trigger = screen.getByRole("combobox", { name: "Milestone" });
  expect(trigger).toHaveTextContent("No milestone");
  await user.click(trigger);
  expect(screen.getByRole("option", { name: "Unavailable" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toHaveTextContent("Long milestone 中文");
  expect(trigger.querySelector("[data-truncate]")).toHaveAttribute("title", "Long milestone 中文");
  expect(trigger.querySelectorAll("[data-truncate]")).toHaveLength(1);
  await user.keyboard("{Enter}{Home}{Enter}");
  await waitFor(() => expect(trigger).toHaveTextContent("No milestone"));
  await user.click(trigger);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("a disabled field preserves its value without opening", async () => {
  render(
    <SelectField
      aria-label="Agent"
      value="missing"
      disabled
      options={[{ value: "missing", label: "Not registered", disabled: true }]}
      onValueChange={() => {}}
    />,
  );
  const trigger = screen.getByRole("combobox", { name: "Agent" });
  expect(trigger).toBeDisabled();
  expect(trigger).toHaveTextContent("Not registered");
  await userEvent.setup().click(trigger);
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("a pending selection does not steal focus after the user continues elsewhere", async () => {
  function Field() {
    const [saving, setSaving] = useState(false);
    return (
      <>
        <SelectField
          aria-label="Agent"
          value="codex"
          disabled={saving}
          onValueChange={() => setSaving(true)}
          options={[
            { value: "codex", label: "Codex" },
            { value: "claude", label: "Claude Code" },
          ]}
        />
        <button type="button" onClick={() => setSaving(false)}>
          Continue
        </button>
      </>
    );
  }
  render(<Field />);
  const user = userEvent.setup();
  const trigger = screen.getByRole("combobox", { name: "Agent" });
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: "Claude Code" }));
  expect(trigger).toBeDisabled();
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  const next = screen.getByRole("button", { name: "Continue" });
  await user.click(next);
  expect(trigger).toBeEnabled();
  expect(next).toHaveFocus();
});
