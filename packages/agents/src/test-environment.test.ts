import { expect, test } from "vitest";
import config from "../../../vitest.config.js";
import { clearAgentTestEnvironment } from "../test/setup.js";

test.each([
  "CLAUDE_CODE_EXECUTABLE",
  "CLAUDECODE",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_AGENT_SDK_VERSION",
  "CODEX_CI",
  "CODEX_SANDBOX",
  "CODEX_THREAD_ID",
  "CODEX_FUTURE_SETTING",
  "GROK_API_KEY",
  "GROK_FUTURE_SETTING",
  "AI_AGENT",
  "STINTWORK_FAKE_SCRIPT",
  "STINTWORK_FAKE_HANDOFF",
  "STINTWORK_FAKE_OPTIONS",
])("test setup removes inherited %s without removing fixture or platform settings", (key) => {
  const settings = {
    PATH: "fixture-bin",
    HOME: "fixture-home",
    NODE_USE_SYSTEM_CA: "1",
    STINTWORK_SKIP_AGENT_DETECTION: "1",
    STINTWORK_TEST_CONFIG: "developer-settings",
  };
  const env = { ...settings, [key]: "/nonexistent" };
  clearAgentTestEnvironment(env);
  expect(env).toEqual(settings);
});

test("test progress stays visible inside agent environments", () => {
  expect(config.test?.reporters).toEqual(["default"]);
});
