// SPDX-License-Identifier: Apache-2.0
type Line = {
  kind: "context" | "added" | "removed";
  text: string;
  noNewline: boolean;
  key: string;
};

export function unifiedLineDiff(before: string | null, content: string) {
  const original = (before ?? "").match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const proposed = content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let prefix = 0;
  while (prefix < original.length && original[prefix] === proposed[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < original.length - prefix &&
    suffix < proposed.length - prefix &&
    original[original.length - suffix - 1] === proposed[proposed.length - suffix - 1]
  )
    suffix++;
  const removed = original.slice(prefix, original.length - suffix);
  const added = proposed.slice(prefix, proposed.length - suffix);
  const lines: Line[] = [];
  let oldLine = 0;
  let newLine = 0;
  function append(kind: Line["kind"], text: string) {
    lines.push({
      kind,
      text: text.replace(/\n$/, ""),
      noNewline: !text.endsWith("\n"),
      key: `${kind}:${oldLine}:${newLine}`,
    });
    if (kind !== "added") oldLine++;
    if (kind !== "removed") newLine++;
  }
  for (const text of original.slice(0, prefix)) append("context", text);
  // ponytail: Cap alignment at 250k cells; large rewrites use removed/added blocks. Use Myers if large-file fine-grained alignment is needed.
  if (!removed.length || !added.length || removed.length * added.length > 250_000) {
    for (const text of removed) append("removed", text);
    for (const text of added) append("added", text);
  } else {
    const lengths = Array.from(
      { length: removed.length + 1 },
      () => new Uint32Array(added.length + 1),
    );
    for (let oldIndex = removed.length - 1; oldIndex >= 0; oldIndex--) {
      for (let newIndex = added.length - 1; newIndex >= 0; newIndex--) {
        lengths[oldIndex][newIndex] =
          removed[oldIndex] === added[newIndex]
            ? lengths[oldIndex + 1][newIndex + 1] + 1
            : Math.max(lengths[oldIndex + 1][newIndex], lengths[oldIndex][newIndex + 1]);
      }
    }
    let oldIndex = 0;
    let newIndex = 0;
    while (oldIndex < removed.length || newIndex < added.length) {
      if (
        oldIndex < removed.length &&
        newIndex < added.length &&
        removed[oldIndex] === added[newIndex]
      ) {
        append("context", removed[oldIndex++]);
        newIndex++;
      } else if (
        oldIndex < removed.length &&
        (newIndex === added.length ||
          lengths[oldIndex + 1][newIndex] >= lengths[oldIndex][newIndex + 1])
      ) {
        append("removed", removed[oldIndex++]);
      } else append("added", added[newIndex++]);
    }
  }
  for (const text of original.slice(original.length - suffix)) append("context", text);
  const ranges: { start: number; end: number }[] = [];
  lines.forEach((line, index) => {
    if (line.kind === "context") return;
    const start = Math.max(0, index - 3);
    const end = Math.min(lines.length, index + 4);
    const previous = ranges.at(-1);
    if (previous && previous.end >= start) previous.end = end;
    else ranges.push({ start, end });
  });
  let oldPosition = 0;
  let newPosition = 0;
  const positions = lines.map((line) => {
    const position = { oldPosition, newPosition };
    if (line.kind !== "added") oldPosition++;
    if (line.kind !== "removed") newPosition++;
    return position;
  });
  return ranges.map(({ start, end }) => {
    const context = lines.slice(start, end);
    const oldCount = context.filter((line) => line.kind !== "added").length;
    const newCount = context.filter((line) => line.kind !== "removed").length;
    const oldStart = positions[start].oldPosition + (oldCount ? 1 : 0);
    const newStart = positions[start].newPosition + (newCount ? 1 : 0);
    return {
      header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      lines: context,
    };
  });
}
