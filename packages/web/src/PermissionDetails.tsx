// SPDX-License-Identifier: Apache-2.0
import { useLanguage } from "./i18n/language";

export function PermissionDetails({ details }: { details?: string }) {
  const { t } = useLanguage();
  if (!details) return null;
  let tool: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(details);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    tool = value as Record<string, unknown>;
  } catch {
    return <pre className="permission-details">{details}</pre>;
  }
  const input =
    tool.rawInput && typeof tool.rawInput === "object" && !Array.isArray(tool.rawInput)
      ? (tool.rawInput as Record<string, unknown>)
      : {};
  const command = Array.isArray(input.command) ? input.command.join(" ") : input.command;
  const paths = [
    input.cwd,
    input.working_directory,
    input.path,
    input.file_path,
    input.filePath,
    ...(Array.isArray(tool.locations) ? tool.locations.map((location) => location?.path) : []),
    ...(Array.isArray(tool.content) ? tool.content.map((content) => content?.path) : []),
  ].filter((path): path is string => typeof path === "string");
  return (
    <>
      {typeof command === "string" && <pre className="permission-details">{command}</pre>}
      {[...new Set(paths)].map((path) => (
        <p key={path}>
          <code>{path}</code>
        </p>
      ))}
      <details>
        <summary>{t.needsYou.fullPermissionJson}</summary>
        <pre className="permission-details">{details}</pre>
      </details>
    </>
  );
}
