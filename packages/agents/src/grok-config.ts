// SPDX-License-Identifier: Apache-2.0
import { coreText, type CoreText } from "@stintwork/core";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const grokConfigPath = join(homedir(), ".grok/config.toml");
export const grokPermissionWarning = coreText({ code: "permission.grokAlwaysApprove" });

function stringValue(token: string): string {
  const multiline = token.startsWith('"""') || token.startsWith("'''");
  const width = multiline ? 3 : 1;
  let value = token.slice(width, -width);
  if (multiline) value = value.replace(/^\r?\n/, "");
  if (token.startsWith("'")) return value;
  if (multiline) value = value.replace(/\\\r?\n\s*/g, "");
  return value.replace(/\\(U[\da-fA-F]{8}|u[\da-fA-F]{4}|[btnfr"\\])/g, (_, escaped: string) =>
    escaped.startsWith("u") || escaped.startsWith("U")
      ? String.fromCodePoint(Number.parseInt(escaped.slice(1), 16))
      : ({ b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" }[escaped] as string),
  );
}

export function readGrokConfig(path = grokConfigPath): {
  permissionMode: string | null;
  warnings: CoreText[];
} {
  try {
    const text = readFileSync(path, "utf8");
    // Grok keeps permission_mode under [ui]; also accept it at the root. Not a full TOML parser.
    const normalized = text.replace(
      /"""(?:\\[\s\S]|"(?!"")|[^"\\])*"""|'''[\s\S]*?'''|"(?:\\[^\r\n]|[^"\\\r\n])*"|'[^'\r\n]*'|#[^\r\n]*/g,
      (token) =>
        token.startsWith("#")
          ? ""
          : JSON.stringify(stringValue(token)).replace(
              /[[\]{}]/g,
              (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
            ),
    );
    const matches: RegExpMatchArray[] = [];
    let depth = 0;
    let table = "";
    for (const line of normalized.split(/\r?\n/)) {
      if (depth === 0) {
        const header = /^\s*(\[\[?)\s*([^[\]]+?)\s*\]\]?\s*$/.exec(line);
        if (header) {
          table = header[1] === "[[" ? `[[${header[2]}]]` : header[2].replace(/^"|"$/g, "");
          continue;
        }
        const setting = /^\s*(?:permission_mode|"permission_mode")\s*=(.*)$/.exec(line);
        if (setting && (table === "" || table === "ui")) matches.push(setting);
      }
      for (const bracket of line.match(/[[\]{}]/g) ?? [])
        depth += bracket === "[" || bracket === "{" ? 1 : -1;
    }
    if (matches.length > 1) throw new Error("Duplicate permission mode.");
    const permissionMode: unknown = matches.length ? JSON.parse(matches[0][1]) : null;
    if (permissionMode !== null && typeof permissionMode !== "string")
      throw new Error("Permission mode is not a string.");
    return {
      permissionMode,
      warnings: permissionMode === "always-approve" ? [grokPermissionWarning] : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { permissionMode: null, warnings: [] };
    return {
      permissionMode: null,
      warnings: [coreText({ code: "permission.grokConfigUnreadable" })],
    };
  }
}
