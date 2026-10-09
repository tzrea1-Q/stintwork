/**
 * A synchronous, read-only snapshot of repo files. Paths are repo-relative,
 * slash-separated file paths; list recursively returns files under the prefix.
 * read returns undefined for a missing file. Port errors become index warnings.
 */
export interface RepoFiles {
  list(prefix: string): readonly string[];
  read(path: string): string | undefined;
}

export type Spec = { path: string; text: string };

export type Ticket = {
  number: number;
  slug: string;
  title: string;
  status: string;
  resolved: boolean;
  blockedBy: number[];
  blocked: boolean;
  comments: string[];
  /** The full ticket Markdown, for display. */
  body: string;
  path: string;
};

export type WorkItem = {
  slug: string;
  title: string;
  type: "feature" | "effort";
  spec: Spec | null;
  tickets: Ticket[];
};

export type Warning = { path: string; message: string };
export type WorkItemIndex = { workItems: WorkItem[]; warnings: Warning[] };

/** Copies the supplied contents so later caller mutations do not change the snapshot. */
export function createMemoryRepoFiles(contents: Readonly<Record<string, string>>): RepoFiles {
  const snapshot = new Map(Object.entries(contents));
  return {
    list: (prefix) => [...snapshot.keys()].filter((path) => path.startsWith(prefix)),
    read: (path) => snapshot.get(path),
  };
}

function readText(files: RepoFiles, path: string, warnings: Warning[]): string | undefined {
  try {
    const text = files.read(path);
    if (typeof text !== "string") {
      warnings.push({ path, message: "File is missing or is not text" });
    } else if (/[\p{Cc}\uFFFD]/u.test(text.replace(/[\t\r\n]/g, ""))) {
      warnings.push({ path, message: "File contains binary or invalid text" });
    } else {
      return text;
    }
  } catch (error) {
    warnings.push({ path, message: `Cannot read file: ${String(error)}` });
  }
  return undefined;
}

function normalize(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function heading(text: string): string | undefined {
  return /^# (.+)$/m.exec(text)?.[1].trim() || undefined;
}

function parseTicket(path: string, text: string, warnings: Warning[]): Ticket | undefined {
  const filename = /\/(\d{2,})-([^/]+)\.md$/.exec(path);
  const number = Number(filename?.[1]);
  const title = heading(text)
    ?.replace(/^\d+\s+(?:—|-)\s+/, "")
    .trim();
  if (!filename || !Number.isSafeInteger(number) || number < 1 || !title) {
    warnings.push({ path, message: "Ticket needs a NN-slug.md filename and a nonempty # heading" });
    return undefined;
  }
  const header = text.split(/^## /m, 1)[0];
  const status = /^Status:[ \t]*(.*)$/m.exec(header)?.[1].trim();
  const blockers = /^Blocked by:[ \t]*(.*)$/m.exec(header)?.[1].trim();
  if (!status) warnings.push({ path, message: "Missing Status before the first ## section" });
  if (blockers === undefined) {
    warnings.push({ path, message: "Missing Blocked by before the first ## section" });
  }
  const references = !blockers || /^none$/i.test(blockers) ? [] : blockers.split(",");
  if (
    references.some(
      (reference) =>
        !/^\d+$/.test(reference.trim()) ||
        !Number.isSafeInteger(Number(reference)) ||
        Number(reference) < 1,
    )
  ) {
    warnings.push({ path, message: "Blocked by must be none or comma-separated ticket numbers" });
    return undefined;
  }
  const comments = text.split(/^## Comments[ \t]*$/m, 2)[1]?.split(/^## /m, 1)[0] ?? "";
  return {
    number,
    slug: filename[2],
    title,
    status: status ?? "",
    resolved: /^(resolved|done|closed)$/i.test(status ?? ""),
    blockedBy: [...new Set(references.map(Number))],
    blocked: false,
    comments: comments
      .split(/\n[ \t]*\n|\n(?=\*\*.+?\*\*)/u)
      .map((block) => block.trim())
      .filter(Boolean),
    body: text,
    path,
  };
}

/** ponytail: rescans the graph per ticket; use an indegree queue for large efforts. */
function orderTickets(tickets: Ticket[], warnings: Warning[]): Ticket[] {
  tickets.sort((left, right) => left.number - right.number);
  const byNumber = new Map(tickets.map((ticket) => [ticket.number, ticket]));
  for (const ticket of tickets) {
    ticket.blocked = ticket.blockedBy.some((number) => !byNumber.get(number)?.resolved);
    for (const number of ticket.blockedBy) {
      if (!byNumber.has(number)) {
        warnings.push({
          path: ticket.path,
          message: `Blocked by references missing ticket ${number}`,
        });
      }
    }
  }
  const pending = new Map(byNumber);
  const ordered: Ticket[] = [];
  while (pending.size) {
    const next = [...pending.values()].find((ticket) =>
      ticket.blockedBy.every((number) => !pending.has(number)),
    );
    if (!next) {
      warnings.push({
        path: [...pending.values()][0].path,
        message: "Dependency cycle; falling back to numeric ticket order",
      });
      return tickets;
    }
    ordered.push(next);
    pending.delete(next.number);
  }
  return ordered;
}

/**
 * Index immediate .scratch/<slug>/ work items, sorted by slug, without I/O.
 * Specs retain their exact text; titles use the first literal '# ' heading or
 * title-cased slug. map.md presence selects effort, otherwise type is feature.
 * Ticket metadata uses the first literal Status:/Blocked by: before a '## '
 * section, trimming values but preserving status case. Missing status is open;
 * missing/empty blockers mean none, with missing metadata producing warnings.
 * Invalid filenames, missing titles, binary text and invalid blocker lists skip
 * that ticket. Duplicate numbers keep the lexically first file and warn.
 * Comments use the first literal '## Comments' section, ending at the next
 * '## ' heading, split at blank lines or a line starting with a **bold** lead.
 * This is a line-based convention reader, not a full Markdown parser.
 */
export function indexWorkItems(files: RepoFiles): WorkItemIndex {
  const warnings: Warning[] = [];
  let paths: readonly string[];
  try {
    paths = files.list(".scratch/");
  } catch (error) {
    return {
      workItems: [],
      warnings: [{ path: ".scratch/", message: `Cannot list files: ${String(error)}` }],
    };
  }
  const directories = new Map<string, string[]>();
  for (const path of [...new Set(paths)].sort()) {
    if (!path.startsWith(".scratch/")) continue;
    if (
      path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      warnings.push({ path, message: "Expected a repo-relative, slash-separated file path" });
      continue;
    }
    const slug = /^\.scratch\/([^/]+)\//.exec(path)?.[1];
    if (!slug) continue;
    const entries = directories.get(slug) ?? [];
    entries.push(path);
    directories.set(slug, entries);
  }
  const workItems: WorkItem[] = [];
  for (const [slug, entries] of [...directories].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    const prefix = `.scratch/${slug}/`;
    const specPath = `${prefix}spec.md`;
    const text = entries.includes(specPath) ? readText(files, specPath, warnings) : undefined;
    const spec = text === undefined ? null : { path: specPath, text };
    const specTitle = text === undefined ? undefined : heading(normalize(text));
    if (spec && !specTitle)
      warnings.push({ path: specPath, message: "Spec has no nonempty # heading" });
    const tickets = new Map<number, Ticket>();
    for (const path of entries) {
      if (!path.startsWith(`${prefix}issues/`) || !/\/issues\/[^/]+\.md$/.test(path)) continue;
      const ticketText = readText(files, path, warnings);
      const ticket =
        ticketText === undefined ? undefined : parseTicket(path, normalize(ticketText), warnings);
      if (!ticket) continue;
      if (tickets.has(ticket.number)) {
        warnings.push({ path, message: `Duplicate ticket number ${ticket.number}` });
      } else {
        tickets.set(ticket.number, ticket);
      }
    }
    workItems.push({
      slug,
      title:
        specTitle ??
        slug.replace(/[-_]+/g, " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()),
      type: entries.includes(`${prefix}map.md`) ? "effort" : "feature",
      spec,
      tickets: orderTickets([...tickets.values()], warnings),
    });
  }
  return { workItems, warnings };
}
