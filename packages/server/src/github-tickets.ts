// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { classifyGithubError, GithubReadError } from "./github-discovery.js";

const execute = promisify(execFile);
type Issue = {
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  repository_url: string;
  state: string;
  state_reason: string | null;
  labels: { name: string }[];
  comments: number;
  sub_issues_summary?: { total: number };
  issue_dependencies_summary?: { total_blocked_by: number };
  pull_request?: unknown;
};
type Comment = { id: number; node_id: string; body: string };

export function githubRateLimitCoolingDown(github: { retryAt?: string } | undefined) {
  return !!github?.retryAt && Date.parse(github.retryAt) > Date.now();
}

export function createDetailPublisher() {
  const sequences = new Map<number, { next: number; published: number }>();
  return (number: number) => {
    const state = sequences.get(number) ?? { next: 0, published: 0 };
    sequences.set(number, state);
    const sequence = ++state.next;
    return (publish: () => void) => {
      if (sequence < state.published) return false;
      state.published = sequence;
      publish();
      return true;
    };
  };
}

/** Read one work item. A failed connection aborts the snapshot. */
export async function readGithubTickets(
  root: string,
  repository: string,
  parentId: string,
  number: number,
) {
  let failure: unknown;
  let active = 0;
  const waiting: (() => void)[] = [];
  let waitingIndex = 0;
  async function get(path: string, optional = false): Promise<{ value: unknown; next: boolean }> {
    await new Promise<void>((resolve) => {
      if (active < 4) {
        active++;
        resolve();
      } else waiting.push(resolve);
    });
    try {
      if (failure) throw failure;
      const { stdout } = await execute("gh", ["api", path, "--include"], {
        cwd: root,
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_HOST: "github.com" },
      });
      const separator = /^HTTP\//.test(stdout) ? /\r?\n\r?\n/.exec(stdout) : null;
      const headers = separator ? stdout.slice(0, separator.index) : "";
      if (/^x-ratelimit-remaining:\s*0\s*$/im.test(headers)) {
        const reset = Number(/^x-ratelimit-reset:\s*(\d+)/im.exec(headers)?.[1]);
        throw new GithubReadError(
          "rate-limited",
          Number.isSafeInteger(reset) && reset * 1000 > Date.now()
            ? new Date(reset * 1000).toISOString()
            : new Date(Date.now() + 60_000).toISOString(),
        );
      }
      return {
        value: JSON.parse(separator ? stdout.slice(separator.index + separator[0].length) : stdout),
        next: /^link:.*rel="next"/im.test(headers),
      };
    } catch (error) {
      const readError = classifyGithubError(error);
      if (!failure && (!optional || readError.code !== "unavailable")) {
        const connection =
          /\/(labels|comments|blocked_by|sub_issues)\?per_page=100&page=(\d+)$/.exec(path);
        if (connection) readError.message += ` Connection ${connection[1]} page ${connection[2]}.`;
        failure = readError;
      }
      throw readError;
    } finally {
      const next = waiting[waitingIndex];
      if (next) {
        waitingIndex++;
        next();
      } else active--;
    }
  }
  function incomplete(connection: string): GithubReadError {
    const error = new GithubReadError("incomplete");
    error.message += ` Connection ${connection}.`;
    return error;
  }
  const issuePath = `repos/${repository}/issues/`;
  function valid(issue: Issue): boolean {
    return (
      !!issue &&
      typeof issue.node_id === "string" &&
      issue.node_id.length > 0 &&
      Number.isSafeInteger(issue.number) &&
      issue.number > 0 &&
      issue.repository_url?.toLowerCase() ===
        `https://api.github.com/repos/${repository}`.toLowerCase() &&
      issue.html_url?.toLowerCase() ===
        `https://github.com/${repository}/issues/${issue.number}`.toLowerCase() &&
      typeof issue.title === "string" &&
      (issue.body === null || typeof issue.body === "string") &&
      ["open", "closed"].includes(issue.state) &&
      Array.isArray(issue.labels) &&
      Number.isSafeInteger(issue.comments) &&
      issue.comments >= 0 &&
      !issue.pull_request
    );
  }
  async function pages<T>(path: string): Promise<T[]> {
    const nodes: T[] = [];
    for (let page = 1; page <= 10; page++) {
      try {
        const result = await get(`${path}?per_page=100&page=${page}`);
        if (!Array.isArray(result.value) || result.value.length > 100)
          throw new GithubReadError("incomplete");
        nodes.push(...(result.value as T[]));
        if (nodes.length >= 1000) throw new GithubReadError("cap");
        if (!result.next) return nodes;
      } catch (error) {
        const readError = classifyGithubError(error);
        if (!readError.message.includes(" Connection "))
          readError.message += ` Connection ${path.split("/").slice(-1)[0]} page ${page}.`;
        failure ??= readError;
        throw readError;
      }
    }
    throw new GithubReadError("cap");
  }
  const parent = (await get(`${issuePath}${number}`)).value as Issue;
  if (!valid(parent) || parent.number !== number || parent.node_id !== parentId)
    throw new GithubReadError("identity");
  const children = await pages<Issue>(`${issuePath}${number}/sub_issues`);
  if (
    !parent.sub_issues_summary ||
    !Number.isSafeInteger(parent.sub_issues_summary.total) ||
    parent.sub_issues_summary.total !== children.length
  )
    throw incomplete("sub_issues");
  if (
    new Set(children.map((child) => child.node_id)).size !== children.length ||
    new Set(children.map((child) => `${child.repository_url}/${child.number}`)).size !==
      children.length
  )
    throw incomplete("sub_issues");
  const parentComments = await pages<Comment>(`${issuePath}${number}/comments`);
  if (
    new Set(parentComments.map((comment) => comment.node_id)).size !== parentComments.length ||
    parentComments.length !== parent.comments
  )
    throw incomplete("comments");
  if (
    parentComments.some(
      (comment) =>
        typeof comment.body !== "string" ||
        !Number.isSafeInteger(comment.id) ||
        typeof comment.node_id !== "string",
    )
  )
    throw incomplete("comments");
  async function readChild(child: Issue) {
    const warnings: string[] = [];
    let complete = true;
    if (
      !valid(child) ||
      !child.sub_issues_summary ||
      !Number.isSafeInteger(child.sub_issues_summary.total)
    ) {
      complete = false;
      warnings.push(`Issue #${child?.number ?? "?"}: unsupported or invalid child.`);
      return { warnings, complete, ticket: undefined };
    }
    if (child.sub_issues_summary.total > 0) {
      complete = false;
      warnings.push(`Issue #${child.number}: nested children excluded.`);
    }
    const connections = await Promise.allSettled([
      pages<{ name: string }>(`${issuePath}${child.number}/labels`),
      pages<Comment>(`${issuePath}${child.number}/comments`),
      pages<Issue>(`${issuePath}${child.number}/dependencies/blocked_by`),
    ] as const);
    if (connections[0].status === "rejected") throw connections[0].reason;
    if (connections[1].status === "rejected") throw connections[1].reason;
    if (connections[2].status === "rejected") throw connections[2].reason;
    const labels = connections[0].value;
    const comments = connections[1].value;
    const blockers = connections[2].value;
    if (labels.some((label) => typeof label.name !== "string")) throw incomplete("labels");
    if (labels.some((label) => label.name.toLowerCase() === "stintwork:work-item"))
      warnings.push(`Issue #${child.number}: labelled child is only a ticket.`);
    if (
      new Set(comments.map((comment) => comment.node_id)).size !== comments.length ||
      comments.length !== child.comments
    )
      throw incomplete("comments");
    if (
      !child.issue_dependencies_summary ||
      !Number.isSafeInteger(child.issue_dependencies_summary.total_blocked_by) ||
      child.issue_dependencies_summary.total_blocked_by !== blockers.length ||
      new Set(blockers.map((blocker) => blocker.node_id)).size !== blockers.length
    )
      throw incomplete("blocked_by");
    if (
      comments.some(
        (comment) =>
          typeof comment.body !== "string" ||
          !Number.isSafeInteger(comment.id) ||
          typeof comment.node_id !== "string",
      ) ||
      blockers.some((blocker) => !valid(blocker))
    )
      throw incomplete("comments or blocked_by");
    const body = child.body ?? "";
    const lines = [...body.matchAll(/^(?:Blocked by:|\*\*Blocked by:\*\*)[ \t]*(.*)$/gim)].map(
      (match) => match[1].trim(),
    );
    const sections = [
      ...body.matchAll(/^## Blocked by[ \t]*\r?$([\s\S]*?)(?=^##[ \t]|$(?![\s\S]))/gim),
    ].map((match) => match[1].trim());
    const ambiguousDescription =
      /\b\d+\b|\b(?:issue|issues|ticket|tickets|pr|pull|depends|blocked|blocker|requires|after)\b|#|\b[a-z][a-z0-9+.-]*:\/\/|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i;
    const text = [...lines, ...sections];
    let textUnknown = text.length > 1;
    let textNumbers: number[] = [];
    const noneMatch =
      text.length === 1 ? /^(?:[-*][ \t]+)?none(?:[ \t]*\(([^()\r\n]*)\))?$/i.exec(text[0]) : null;
    const none =
      noneMatch &&
      !ambiguousDescription.test(noneMatch[1] ?? "") &&
      (sections.length === 1 || !/^[-*]/.test(text[0]));
    if (text.length === 1 && !none) {
      const value = text[0];
      const exact = /^(?:\s*(?:[-*]\s*)?#\d+\s*(?:,|\n|$))+$/i.test(value);
      const descriptionLines = sections.length === 1 ? value.split("\n") : [value];
      const described =
        value.length > 0 &&
        descriptionLines.every((line) => {
          if (!line.trim()) return sections.length === 1;
          const match = /^[ \t]*(?:[-*][ \t]*)?#\d+(?:[ \t]+(.+?))?[ \t]*$/.exec(line);
          return !!match && !ambiguousDescription.test(match[1] ?? "");
        });
      if (!exact && !described) textUnknown = true;
      else
        textNumbers = [...new Set([...value.matchAll(/#(\d+)/g)].map((match) => Number(match[1])))];
    }
    const nativeNumbers = blockers.map((blocker) => blocker.number);
    if (
      blockers.length &&
      (textUnknown ||
        (text.length &&
          (textNumbers.length !== nativeNumbers.length ||
            textNumbers.some((n) => !nativeNumbers.includes(n)))))
    )
      warnings.push(`Issue #${child.number}: native and text blockers disagree.`);
    let effective = blockers;
    if (!blockers.length && !textUnknown && textNumbers.length) {
      effective = [];
      for (const reference of textNumbers) {
        try {
          const blocker = (await get(`${issuePath}${reference}`, true)).value as Issue;
          if (!valid(blocker) || blocker.number !== reference)
            throw new GithubReadError("identity");
          effective.push(blocker);
        } catch (error) {
          if (failure) throw failure;
          const readError = classifyGithubError(error);
          if (readError.code !== "unavailable" && readError.code !== "identity") throw readError;
          textUnknown = true;
          warnings.push(`Issue #${child.number}: blocker #${reference} unavailable.`);
        }
      }
    }
    if (!blockers.length && textUnknown) {
      complete = false;
      warnings.push(`Issue #${child.number}: text blockers unknown.`);
    }
    const ticket = {
      id: child.node_id,
      url: child.html_url,
      number: child.number,
      title: child.title,
      state: child.state,
      stateReason: child.state_reason,
      labels: labels.map((label) => label.name),
      body,
      comments: comments.map((comment) => comment.body),
      commentRecords: comments.map((comment) => ({ id: comment.node_id, body: comment.body })),
      blockers: effective.map((blocker) => ({
        id: blocker.node_id,
        number: blocker.number,
        state: blocker.state,
      })),
      blockedBy: blockers.length ? nativeNumbers : textNumbers,
      blocked:
        (!blockers.length && textUnknown) ||
        effective.some((blocker) => blocker.state !== "closed"),
    };
    return { warnings, complete, ticket };
  }
  const settled = await Promise.allSettled(
    children.map(async (child) => {
      try {
        return await readChild(child);
      } catch (error) {
        failure ??= error;
        throw error;
      }
    }),
  );
  if (failure) throw failure;
  const results = settled.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
  return {
    spec: parent.body ?? "",
    comments: parentComments.map((comment) => comment.body),
    tickets: results.flatMap(({ ticket }) => (ticket ? [ticket] : [])),
    complete: results.every((result) => result.complete),
    warnings: results.flatMap((result) => result.warnings),
  };
}

export function dependencyOnlyIncomplete(detail: { complete?: boolean; warnings?: string[] }) {
  return (
    detail.complete === false &&
    !!detail.warnings?.some((warning) => /text blockers unknown\.$/.test(warning)) &&
    detail.warnings.every((warning) =>
      /(?:text blockers unknown|native and text blockers disagree|blocker #\d+ unavailable|labelled child is only a ticket)\.$/.test(
        warning,
      ),
    )
  );
}
