// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shipGit } from "./pull-requests.js";
import { coreTextEnglish, githubWorkflowPath, type RepoFiles } from "@stintwork/core";
import { parseDocument } from "yaml";

const execute = promisify(execFile);
export type GithubErrorCode =
  | "gh-missing"
  | "login"
  | "unavailable"
  | "rate-limited"
  | "offline"
  | "server-error"
  | "incomplete"
  | "cap"
  | "identity";
const errorMessages: Record<GithubErrorCode, string> = {
  "gh-missing": "GitHub CLI is not installed. Install gh, then retry.",
  login: "GitHub login is unavailable. Sign in with gh, then retry.",
  unavailable: "Repository or issue unavailable. Check the repository and your access, then retry.",
  "rate-limited": "GitHub rate limit reached. Retry after the indicated time.",
  offline: "GitHub could not be reached. Showing stale data when available.",
  "server-error": "GitHub could not be reached. Showing stale data when available.",
  incomplete: "Results are incomplete; dependencies and approvals may be unknown.",
  cap: "Results are incomplete; a connection reached its safety cap.",
  identity: coreTextEnglish["gate.identityAmbiguous"],
};
export class GithubReadError extends Error {
  constructor(
    public code: GithubErrorCode,
    public retryAt?: string,
  ) {
    super(`${errorMessages[code]}${retryAt ? ` Retry after ${retryAt}.` : ""}`);
  }
}
export function classifyGithubError(error: unknown): GithubReadError {
  if (error instanceof GithubReadError) return error;
  const value = error as { code?: unknown; stderr?: unknown; stdout?: unknown } | null;
  if (value?.code === "ENOENT") return new GithubReadError("gh-missing");
  const detail = `${typeof value?.stderr === "string" ? value.stderr : ""}\n${typeof value?.stdout === "string" ? value.stdout.slice(0, 8192) : ""}`;
  if (/rate limit|secondary rate/i.test(detail)) {
    const seconds = /^retry-after:\s*(\d+)/im.exec(detail)?.[1];
    const reset = /^x-ratelimit-reset:\s*(\d+)/im.exec(detail)?.[1];
    const timestamp = seconds
      ? Date.now() + Number(seconds) * 1000
      : reset
        ? Number(reset) * 1000
        : 0;
    return new GithubReadError(
      "rate-limited",
      timestamp > Date.now() && timestamp < 8640000000000000
        ? new Date(timestamp).toISOString()
        : new Date(Date.now() + 60_000).toISOString(),
    );
  }
  if (/HTTP 5\d\d|server error/i.test(detail)) return new GithubReadError("server-error");
  if (/network|connect|timed? out|could not resolve|no such host|ENOTFOUND/i.test(detail))
    return new GithubReadError("offline");
  return new GithubReadError("unavailable");
}

function responseJson(stdout: string): unknown {
  try {
    if (!stdout.startsWith("HTTP/")) return JSON.parse(stdout);
    const separator = /\r?\n\r?\n/.exec(stdout);
    if (!separator) throw new GithubReadError("incomplete");
    return JSON.parse(stdout.slice(separator.index + separator[0].length));
  } catch {
    throw new GithubReadError("incomplete");
  }
}

/** Resolve only the project's explicit, credential-free github.com origin. */
export async function githubOrigin(root: string) {
  let origin: string;
  try {
    origin = await shipGit(root, ["config", "--get-all", "remote.origin.url"]);
  } catch {
    throw new GithubReadError("identity");
  }
  const match =
    /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(
      origin,
    );
  if (!match || match[2] === "." || match[2] === "..") throw new GithubReadError("identity");
  return `${match[1]}/${match[2]}`;
}

export async function githubViewer(root: string): Promise<string> {
  const options = {
    cwd: root,
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_HOST: "github.com" },
  };
  try {
    await execute("gh", ["auth", "status", "--active", "--hostname", "github.com"], options);
  } catch (error) {
    if ((error as { code?: unknown })?.code === "ENOENT") throw new GithubReadError("gh-missing");
    throw new GithubReadError("login");
  }
  try {
    const { stdout } = await execute("gh", ["api", "user", "--jq", ".id"], options);
    const id = stdout.trim();
    if (!/^[1-9][0-9]*$/.test(id)) throw new GithubReadError("login");
    return id;
  } catch (error) {
    throw classifyGithubError(error);
  }
}

export async function githubTrackerRepository(root: string) {
  const repository = await githubOrigin(root);
  const gh = async (args: string[]) =>
    (
      await execute("gh", args, {
        cwd: root,
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_HOST: "github.com" },
      })
    ).stdout;
  try {
    await gh(["auth", "status", "--active", "--hostname", "github.com"]);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      throw new GithubReadError("gh-missing");
    throw new GithubReadError("login");
  }
  let data: { node_id?: unknown; full_name?: unknown; html_url?: unknown };
  try {
    data = responseJson(await gh(["api", `repos/${repository}`, "--include"])) as typeof data;
  } catch (error) {
    throw classifyGithubError(error);
  }
  if (
    !data ||
    typeof data.node_id !== "string" ||
    !data.node_id ||
    typeof data.full_name !== "string" ||
    data.full_name.toLowerCase() !== repository.toLowerCase() ||
    data.html_url !== `https://github.com/${data.full_name}`
  )
    throw new GithubReadError("identity");
  return { repository: data.full_name, repositoryId: data.node_id, url: data.html_url };
}

type Connection<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
type Child = { repository: { id: string }; subIssues: { totalCount: number } };
type Issue = {
  id: string;
  number: number;
  title: string;
  url: string;
  parent: { id: string } | null;
  labels: Connection<{ name: string }>;
  subIssues: Connection<Child> & { totalCount: number };
};
type Page = { cost: number; remaining: number; resetAt: string };
export type GithubDiscovery = {
  repository: string;
  repositoryId: string;
  items: {
    id: string;
    number: number;
    title: string;
    url: string;
    complete: boolean;
    bound?: boolean;
    provisional?: boolean;
    detailFailed?: boolean;
    discoveryComplete?: boolean;
    detail?: {
      fetchedAt: string;
      stale?: boolean;
      spec: string;
      comments: string[];
      tickets: {
        id: string;
        url: string;
        blockers: { id: string; number: number; state: string }[];
        commentRecords: { id: string; body: string }[];
        number: number;
        title: string;
        state: string;
        stateReason: string | null;
        labels: string[];
        body: string;
        comments: string[];
        blockedBy: number[];
        blocked: boolean;
      }[];
      complete: boolean;
      warnings: string[];
    };
  }[];
  scanned: number;
  cursor: string | null;
  complete: boolean;
  pages: Page[];
  discardedPages?: Page[];
  retryable?: boolean;
  membershipIncomplete?: boolean;
  warnings: string[];
  error?: string;
  errorCode?: GithubErrorCode;
  retryAt?: string;
  stale?: boolean;
  discoveryFailed?: boolean;
  fetchedAt?: string;
};

const issueFields = `id number title url parent { id } labels(first: 100) { nodes { name } pageInfo { hasNextPage endCursor } } subIssues(first: 100) { totalCount nodes { repository { id } subIssues(first: 1) { totalCount } } pageInfo { hasNextPage endCursor } }`;
const issuesQuery = `query($owner:String!,$repo:String!,$cursor:String) { repository(owner:$owner,name:$repo) { id nameWithOwner issues(first:100,after:$cursor,orderBy:{field:CREATED_AT,direction:ASC}) { nodes { ${issueFields} } pageInfo { hasNextPage endCursor } } } rateLimit { cost remaining resetAt } }`;
const relationshipQuery = (field: "labels" | "subIssues") =>
  `query($id:ID!,$cursor:String) { node(id:$id) { ... on Issue { id ${field}(first:100,after:$cursor) { nodes { ${field === "labels" ? "name" : "repository { id } subIssues(first: 1) { totalCount }"} } pageInfo { hasNextPage endCursor } } } } rateLimit { cost remaining resetAt } }`;

export async function discoverGithubWorkItems(
  root: string,
  cursor: string | null = null,
): Promise<GithubDiscovery> {
  const repository = await githubTrackerRepository(root);
  const [owner, repo] = repository.repository.split("/");
  const result: GithubDiscovery = {
    ...repository,
    items: [],
    scanned: 0,
    cursor,
    complete: false,
    pages: [],
    warnings: [],
  };
  async function query(queryText: string, variables: Record<string, string | null>) {
    const args = ["api", "graphql", "--include", "-f", `query=${queryText}`];
    for (const [key, value] of Object.entries(variables))
      if (value !== null) args.push("-f", `${key}=${value}`);
    let stdout: string;
    try {
      ({ stdout } = await execute("gh", args, {
        cwd: root,
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_HOST: "github.com" },
      }));
    } catch (error) {
      throw classifyGithubError(error);
    }
    const response = responseJson(stdout) as {
      errors?: unknown;
      data?: {
        rateLimit: Page;
        repository?: { id: string; nameWithOwner: string; issues: Connection<Issue> };
        node?: { id: string; labels: Connection<{ name: string }>; subIssues: Connection<Child> };
      };
    };
    if (
      !response.data?.rateLimit ||
      typeof response.data.rateLimit.cost !== "number" ||
      typeof response.data.rateLimit.remaining !== "number" ||
      typeof response.data.rateLimit.resetAt !== "string"
    )
      throw new GithubReadError("incomplete");
    result.pages.push(response.data.rateLimit);
    const rateError =
      Array.isArray(response.errors) &&
      response.errors.some(
        (error: unknown) =>
          error &&
          typeof error === "object" &&
          (("type" in error && error.type === "RATE_LIMITED") ||
            ("message" in error &&
              typeof error.message === "string" &&
              /rate limit/i.test(error.message))),
      );
    if (response.data.rateLimit.remaining <= 0 || rateError)
      throw new GithubReadError("rate-limited", response.data.rateLimit.resetAt);
    if (response.errors) throw new GithubReadError("incomplete");
    return response.data;
  }
  function validConnection<T>(connection: Connection<T>) {
    return (
      connection &&
      Array.isArray(connection.nodes) &&
      connection.pageInfo &&
      typeof connection.pageInfo.hasNextPage === "boolean" &&
      (!connection.pageInfo.hasNextPage ||
        (typeof connection.pageInfo.endCursor === "string" &&
          connection.pageInfo.endCursor.length > 0))
    );
  }
  async function more<T>(
    issue: Issue,
    field: "labels" | "subIssues",
    initial: Connection<T>,
    observe?: (nodes: T[]) => void,
  ): Promise<T[]> {
    if (Array.isArray(initial?.nodes)) observe?.(initial.nodes);
    if (!validConnection(initial))
      throw new Error(`Incomplete ${field} connection for issue #${issue.number}.`);
    const nodes = [...initial.nodes];
    let page = initial.pageInfo;
    const cursors = new Set<string>();
    while (page.hasNextPage) {
      if (nodes.length >= 1000 || !page.endCursor || cursors.has(page.endCursor))
        throw new GithubReadError("cap");
      cursors.add(page.endCursor);
      const data = await query(relationshipQuery(field), { id: issue.id, cursor: page.endCursor });
      const connection = data.node?.[field] as unknown as Connection<T>;
      if (
        data.node?.id !== issue.id ||
        !validConnection(connection) ||
        nodes.length + connection.nodes.length > 1000
      )
        throw new Error(`Incomplete ${field} connection for issue #${issue.number}.`);
      nodes.push(...connection.nodes);
      observe?.(connection.nodes);
      page = connection.pageInfo;
    }
    if (nodes.length >= 1000) throw new GithubReadError("cap");
    return nodes;
  }
  let provisional: GithubDiscovery["items"][number] | undefined;
  let checkpoint = {
    scanned: result.scanned,
    items: result.items.length,
    pages: result.pages.length,
    warnings: result.warnings.length,
    error: result.error,
    cursor: result.cursor,
  };
  try {
    let next: string | null = cursor;
    const issueCursors = new Set<string>();
    for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
      checkpoint = {
        scanned: result.scanned,
        items: result.items.length,
        pages: result.pages.length,
        warnings: result.warnings.length,
        error: result.error,
        cursor: result.cursor,
      };
      const data = await query(issuesQuery, { owner, repo, cursor: next });
      if (
        data.repository?.id !== repository.repositoryId ||
        data.repository?.nameWithOwner !== repository.repository ||
        !validConnection(data.repository.issues) ||
        data.repository.issues.nodes.length > 100
      )
        throw new Error("GitHub repository identity or issue page is ambiguous.");
      const page = data.repository.issues as Connection<Issue>;
      for (const issue of page.nodes) {
        result.scanned++;
        if (
          !issue.id ||
          !Number.isSafeInteger(issue.number) ||
          issue.number < 1 ||
          typeof issue.title !== "string" ||
          issue.url !== `https://github.com/${repository.repository}/issues/${issue.number}` ||
          !(issue.parent === null || typeof issue.parent?.id === "string")
        )
          throw new Error("GitHub issue identity is ambiguous.");
        let membershipKnown =
          Array.isArray(issue.subIssues?.nodes) &&
          issue.subIssues.nodes.some((child) => child?.repository?.id === repository.repositoryId);
        try {
          const labels = await more(issue, "labels", issue.labels, (nodes) => {
            if (
              nodes.some(
                (label) =>
                  typeof label?.name === "string" &&
                  label.name.toLowerCase() === "stintwork:work-item",
              )
            )
              membershipKnown = true;
          });
          if (labels.some((label) => !label || typeof label.name !== "string"))
            throw new Error("Invalid label connection.");
          const labelled = labels.some(
            (label) =>
              typeof label.name === "string" && label.name.toLowerCase() === "stintwork:work-item",
          );
          if (issue.parent) {
            if (labelled) result.warnings.push(`Issue #${issue.number}: labelled child excluded.`);
            continue;
          }
          const children = await more(issue, "subIssues", issue.subIssues, (nodes) => {
            if (nodes.some((child) => child?.repository?.id === repository.repositoryId))
              membershipKnown = true;
          });
          if (
            children.some(
              (child) =>
                !child?.repository ||
                typeof child.repository.id !== "string" ||
                !child.subIssues ||
                !Number.isSafeInteger(child.subIssues.totalCount),
            )
          )
            throw new Error(`Incomplete subIssues connection for issue #${issue.number}.`);
          const cross = children.some((child) => child.repository.id !== repository.repositoryId);
          const nested = children.some((child) => child.subIssues.totalCount > 0);
          if (cross || nested)
            result.warnings.push(
              `Issue #${issue.number}: cross-repository or nested children excluded.`,
            );
          if (labelled || children.some((child) => child.repository.id === repository.repositoryId))
            result.items.push({
              id: issue.id,
              number: issue.number,
              title: issue.title,
              url: issue.url,
              complete: !cross && !nested,
            });
        } catch (error) {
          if (
            error instanceof GithubReadError &&
            ["rate-limited", "offline", "server-error"].includes(error.code)
          ) {
            if (issue.parent === null && membershipKnown)
              provisional = {
                id: issue.id,
                number: issue.number,
                title: issue.title,
                url: issue.url,
                complete: false,
                provisional: true,
              };
            throw error;
          }
          const failure =
            error instanceof GithubReadError && error.code === "cap"
              ? error
              : new GithubReadError("incomplete");
          result.warnings.push(
            `Issue #${issue.number}: ${failure.code === "cap" ? "relationship safety cap reached" : "relationship unavailable or incomplete"}.`,
          );
          result.error = failure.message;
          result.errorCode = failure.code;
          if (issue.parent === null && membershipKnown)
            result.items.push({
              id: issue.id,
              number: issue.number,
              title: issue.title,
              url: issue.url,
              complete: false,
            });
        }
      }
      next = page.pageInfo.endCursor;
      result.cursor = page.pageInfo.hasNextPage ? next : null;
      if (!page.pageInfo.hasNextPage) {
        result.complete = !result.error && result.items.every((item) => item.complete);
        break;
      }
      if (!next || issueCursors.has(next)) throw new Error("GitHub issue cursor is invalid.");
      issueCursors.add(next);
    }
  } catch (error) {
    // Only complete issue pages advance the cursor; retain aborted request costs separately.
    const discarded = result.pages.splice(checkpoint.pages);
    if (discarded.length) result.discardedPages = [...(result.discardedPages ?? []), ...discarded];
    result.items.length = checkpoint.items;
    result.warnings.length = checkpoint.warnings;
    if (provisional) {
      result.items.push(provisional);
      result.warnings.push(`Issue #${provisional.number}: relationship unavailable or incomplete.`);
    }
    result.scanned = checkpoint.scanned;
    result.cursor = checkpoint.cursor;
    result.membershipIncomplete = Boolean(checkpoint.error);
    result.retryable = true;
    const failure = classifyGithubError(error);
    result.error = failure.message;
    result.errorCode = failure.code;
    if (failure.retryAt) result.retryAt = failure.retryAt;
  }
  result.items.sort((a, b) => a.number - b.number);
  return result;
}

/** Validate identities already recorded by the workflow boundary; never create or rewrite them. */
export function validateGithubIdentities(
  files: RepoFiles,
  discovery: GithubDiscovery,
): GithubDiscovery {
  const known = new Map<number, { id: string; url: string }>();
  for (const path of files.list(".stintwork/github/")) {
    if (!path.endsWith("/workflow.yaml")) continue;
    const match = githubWorkflowPath(path);
    if (!match) throw new GithubReadError("identity");
    const document = parseDocument(files.read(path) ?? "");
    const value: unknown = document.toJS();
    const identity =
      value && typeof value === "object" && "github" in value
        ? (value.github as Record<string, unknown>)
        : undefined;
    if (
      document.errors.length ||
      document.warnings.length ||
      !identity ||
      identity.host !== "github.com" ||
      typeof identity.repository !== "string" ||
      identity.repository.toLowerCase() !== `${match[1]}/${match[2]}` ||
      identity.repository.toLowerCase() !== discovery.repository.toLowerCase() ||
      identity.repositoryId !== discovery.repositoryId ||
      identity.number !== Number(match[3]) ||
      typeof identity.issueId !== "string" ||
      !identity.issueId ||
      identity.url !== `https://github.com/${identity.repository}/issues/${match[3]}`
    )
      throw new GithubReadError("identity");
    known.set(identity.number as number, { id: identity.issueId, url: identity.url as string });
  }
  if (
    discovery.complete &&
    [...known.keys()].some((number) => !discovery.items.some((item) => item.number === number))
  )
    throw new GithubReadError("identity");
  const items = discovery.items.map((item) => {
    const identity = known.get(item.number);
    if (identity && (identity.id !== item.id || identity.url !== item.url))
      throw new GithubReadError("identity");
    return { ...item, bound: identity?.id === item.id };
  });
  return { ...discovery, items };
}
