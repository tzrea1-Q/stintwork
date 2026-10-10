import { expect, test } from "vitest";
import { readableToolOutput } from "./tool-output";

test("only valid UTF-8 byte arrays are decoded; ordinary, malformed and non-byte output survives", () => {
  expect(readableToolOutput('{"output":[99,111,100,101,120]}')).toBe("codex");
  expect(readableToolOutput('{"output":[]}')).toBe("");
  expect(readableToolOutput('{"output":[99,111,100,101,120],"exit_code":1}')).toBe(
    'codex\n{\n  "exit_code": 1\n}',
  );
  for (const text of [
    "Plain text",
    "{bad",
    '{"output":"text"}',
    '{"output":[256]}',
    '{"output":[-1]}',
    '{"output":[1.5]}',
    '{"output":["99"]}',
    '{"output":[255]}',
    "null",
  ])
    expect(readableToolOutput(text)).toBe(text);
});
