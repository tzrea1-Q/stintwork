// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shipGit } from "./pull-requests.js";

const execute = promisify(execFile);
class RateLimitError extends Error {}

/** Resolve only the project's explicit, credential-free github.com origin. */
export async function githubTrackerRepository(root: string) {
  let origin: string;
  try {
    origin = await shipGit(root, ["config", "--get-all", "remote.origin.url"]);
  } catch {
    throw new Error("GitHub origin is unavailable or ambiguous.");
  }
  const match =
    /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(
      origin,
    );
  if (!match || match[2] === "." || match[2] === "..")
    throw new Error("GitHub origin is unavailable or ambiguous.");
  const repository = `${match[1]}/${match[2]}`;
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
      throw new Error("GitHub CLI is not installed. Install gh, then retry.");
    throw new Error("GitHub login is unavailable. Sign in with gh, then retry.");
  }
  let data: { node_id?: unknown; full_name?: unknown; html_url?: unknown };
  try {
    data = JSON.parse(await gh(["api", `repos/${repository}`]));
  } catch {
    throw new Error(
      "Repository or issue unavailable. Check the repository and your access, then retry.",
    );
  }
  if (
    !data ||
    typeof data.node_id !== "string" ||
    !data.node_id ||
    typeof data.full_name !== "string" ||
    data.full_name.toLowerCase() !== repository.toLowerCase() ||
    data.html_url !== `https://github.com/${data.full_name}`
  )
    throw new Error("GitHub repository identity is ambiguous. Resolve it before retrying.");
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
  items: { id: string; number: number; title: string; url: string; complete: boolean }[];
  scanned: number;
  cursor: string | null;
  complete: boolean;
  pages: Page[];
  warnings: string[];
  error?: string;
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
    const args = ["api", "graphql", "-f", `query=${queryText}`];
    for (const [key, value] of Object.entries(variables))
      if (value !== null) args.push("-f", `${key}=${value}`);
    const { stdout } = await execute("gh", args, {
      cwd: root,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_HOST: "github.com" },
    });
    const response = JSON.parse(stdout);
    if (
      response.errors ||
      !response.data ||
      !response.data.rateLimit ||
      typeof response.data.rateLimit.cost !== "number" ||
      typeof response.data.rateLimit.remaining !== "number" ||
      typeof response.data.rateLimit.resetAt !== "string"
    )
      throw new Error("GitHub returned an incomplete GraphQL page.");
    result.pages.push(response.data.rateLimit);
    if (response.data.rateLimit.remaining <= 0)
      throw new RateLimitError(
        `GitHub rate limit reached. Retry after ${response.data.rateLimit.resetAt}.`,
      );
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
  ): Promise<T[]> {
    if (!validConnection(initial))
      throw new Error(`Incomplete ${field} connection for issue #${issue.number}.`);
    const nodes = [...initial.nodes];
    let page = initial.pageInfo;
    const cursors = new Set<string>();
    while (page.hasNextPage) {
      if (nodes.length >= 1000 || !page.endCursor || cursors.has(page.endCursor))
        throw new Error(`Capped or invalid ${field} connection for issue #${issue.number}.`);
      cursors.add(page.endCursor);
      const data = await query(relationshipQuery(field), { id: issue.id, cursor: page.endCursor });
      const connection = data.node?.[field] as Connection<T>;
      if (
        data.node?.id !== issue.id ||
        !validConnection(connection) ||
        nodes.length + connection.nodes.length > 1000
      )
        throw new Error(`Incomplete ${field} connection for issue #${issue.number}.`);
      nodes.push(...connection.nodes);
      page = connection.pageInfo;
    }
    if (nodes.length >= 1000)
      throw new Error(`Capped ${field} connection for issue #${issue.number}.`);
    return nodes;
  }
  try {
    let next: string | null = cursor;
    const issueCursors = new Set<string>();
    for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
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
        try {
          const labels = await more(issue, "labels", issue.labels);
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
          const children = await more(issue, "subIssues", issue.subIssues);
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
          if (error instanceof RateLimitError) throw error;
          result.warnings.push(`Issue #${issue.number}: relationship unavailable or incomplete.`);
          result.error = "Results are incomplete; dependencies and approvals may be unknown.";
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
    result.error =
      error instanceof RateLimitError
        ? error.message
        : "Repository or issue unavailable. Check the repository and your access, then retry.";
  }
  result.items.sort((a, b) => a.number - b.number);
  return result;
}
