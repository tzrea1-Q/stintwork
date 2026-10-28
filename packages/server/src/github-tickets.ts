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

/** Read one work item. All requests are sequential, and a failed connection aborts the snapshot. */
export async function readGithubTickets(
  root: string,
  repository: string,
  parentId: string,
  number: number,
) {
  async function get(path: string): Promise<{ value: unknown; next: boolean }> {
    try {
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
      throw classifyGithubError(error);
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
        const failure = classifyGithubError(error);
        failure.message += ` Connection ${path.split("/").slice(-1)[0]} page ${page}.`;
        throw failure;
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
  const warnings: string[] = [];
  let complete = true;
  const tickets = [];
  for (const child of children) {
    if (
      !valid(child) ||
      !child.sub_issues_summary ||
      !Number.isSafeInteger(child.sub_issues_summary.total)
    ) {
      complete = false;
      warnings.push(`Issue #${child?.number ?? "?"}: unsupported or invalid child.`);
      continue;
    }
    if (child.sub_issues_summary.total > 0) {
      complete = false;
      warnings.push(`Issue #${child.number}: nested children excluded.`);
    }
    const labels = await pages<{ name: string }>(`${issuePath}${child.number}/labels`);
    if (labels.some((label) => typeof label.name !== "string")) throw incomplete("labels");
    if (labels.some((label) => label.name.toLowerCase() === "stintwork:work-item"))
      warnings.push(`Issue #${child.number}: labelled child is only a ticket.`);
    const comments = await pages<Comment>(`${issuePath}${child.number}/comments`);
    if (
      new Set(comments.map((comment) => comment.node_id)).size !== comments.length ||
      comments.length !== child.comments
    )
      throw incomplete("comments");
    const blockers = await pages<Issue>(`${issuePath}${child.number}/dependencies/blocked_by`);
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
    const lines = [...body.matchAll(/^Blocked by:\s*(.*)$/gim)].map((match) => match[1].trim());
    const sections = [...body.matchAll(/^## Blocked by\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/gim)].map(
      (match) => match[1].trim(),
    );
    const text = [...lines, ...sections];
    let textUnknown = text.length > 1;
    let textNumbers: number[] = [];
    if (text.length === 1 && !/^none$/i.test(text[0])) {
      const value = text[0];
      const exact = /^(?:\s*(?:[-*]\s*)?#\d+\s*(?:,|\n|$))+$/i.test(value);
      const sectionLines =
        sections.length === 1 &&
        value
          .split("\n")
          .every((line) => !line.trim() || /^\s*(?:[-*]\s*)?#\d+(?:\s+[^#]*)?\s*$/.test(line));
      if (!exact && !sectionLines) textUnknown = true;
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
          const blocker = (await get(`${issuePath}${reference}`)).value as Issue;
          if (!valid(blocker) || blocker.number !== reference)
            throw new GithubReadError("identity");
          effective.push(blocker);
        } catch (error) {
          const failure = classifyGithubError(error);
          if (failure.code !== "unavailable" && failure.code !== "identity") throw failure;
          textUnknown = true;
          warnings.push(`Issue #${child.number}: blocker #${reference} unavailable.`);
        }
      }
    }
    if (!blockers.length && textUnknown) {
      complete = false;
      warnings.push(`Issue #${child.number}: text blockers unknown.`);
    }
    tickets.push({
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
    });
  }
  return {
    spec: parent.body ?? "",
    comments: parentComments.map((comment) => comment.body),
    tickets,
    complete,
    warnings,
  };
}
