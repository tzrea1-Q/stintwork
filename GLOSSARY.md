# Stintwork

A local workbench where one developer takes software work through guided workflows, handing it between coding agents in stints while the project's intent and memory live in the repo.

## The work

**Project**:
One git repository opened in Stintwork, together with its project memory and work items.
_Avoid_: Workspace, repo (when the product concept is meant)

**Milestone**:
A named, dated group of work items that together deliver something worth shipping. The roadmap is the ordered list of milestones.
_Avoid_: Epic, release, sprint

**Work item**:
One feature, bug or quick task being taken through a workflow. Its files live in its own feature folder.
_Avoid_: Issue, task, card (a card is how a work item looks on the board)

**Ticket**:
A thin slice of a work item's implementation, with its own status and the tickets that block it.
_Avoid_: Subtask, issue, story

**Spec**:
The agreed description of a work item's intended outcome, including its acceptance criteria.
_Avoid_: PRD, requirements doc

**Shipped**:
A work item whose change is merged. Distinct from a stint finishing or a stage being done.
_Avoid_: Done, complete (ambiguous between stint, stage and work item)

## Workflows

**Workflow**:
The ordered stages a type of work item goes through, such as Feature, Bug or Quick task.
_Avoid_: Pipeline (that is a view), process

**Stage**:
One step of a workflow, such as Clarify, Spec or Review. A stage is done only when its gate is passed.
_Avoid_: Step, phase, column (a column is how a stage looks on the board)

**Gate**:
The condition that ends a stage: the developer's approval, passing checks, or a merge.
_Avoid_: Checkpoint (that is a commit), approval (one kind of gate)

**Skill**:
A packaged set of agent instructions that a stage invokes, such as `/to-spec` or `/implement`.
_Avoid_: Command, prompt, plugin

## Agents and stints

**Agent**:
A coding agent used under the developer's own login, such as Claude Code, Codex or Grok Build.
_Avoid_: Model, bot, harness, runtime

**Agent source**:
Which executable a stint uses: **Installed** is the developer's compatible CLI; **Bundled** is the pinned fallback prepared by Stintwork on explicit first use.
_Avoid_: Agent version (a version does not identify its source)

**Stint**:
One agent's turn on one stage of a work item, optionally on one ticket. It starts from a brief and ends with a handoff.
_Avoid_: Run, session, job, task

**Brief**:
What Stintwork gives an agent at the start of a stint: the skill to invoke, pointers to the files to read, the last handoff, and what changed since.
_Avoid_: Context, prompt (the prompt is the brief's rendered text)

**Handoff**:
The agent's account at the end of a stint: where it stopped, what is unresolved, and the suggested next step.
_Avoid_: Summary, notes, report

**Checkpoint**:
The commit Stintwork makes when a stint ends, so the next stint starts from a recorded state.
_Avoid_: Snapshot, save point, WIP

**Permission level**:
How much a stint may do without asking the developer: Ask, Edit freely, or Autonomous. Stintwork translates it into each agent's own modes.
_Avoid_: Mode (an agent's own setting), sandbox

## The developer's attention

**Attention item**:
Something only the developer can resolve: an agent's question, a permission request, a gate approval, a stale approval, a review, or a memory proposal. "Needs you" is the list of open attention items, followed by project warnings. Project warnings are not attention items.
_Avoid_: Notification, inbox item, decision (reserved for decision records)

**Project memory**:
Everything durable an agent should know about the project: AGENTS.md, the glossary, decision records, specs, tickets and their comments.
_Avoid_: Context, knowledge base

**Memory proposal**:
A change to project memory suggested by an agent during a stint, which the developer accepts or rejects.
_Avoid_: Memory update, suggestion

**Decision record**:
A short note in project memory of a hard-to-reverse decision and why it was made.
_Avoid_: ADR (fine as the file convention, not as the product word)

## Views

**View**:
One way of presenting the same project: Pipeline (a board of stages), Lists, or Cockpit.
_Avoid_: Layout, mode, theme

## Chinese terms

Product and agent names stay unchanged. Stint and Agent are also left untranslated.

| English | 简体中文 |
|---|---|
| Project | 项目 |
| Milestone | 里程碑 |
| Work item | 工作项 |
| Ticket | 工单 |
| Spec | 规格说明 |
| Shipped | 已交付 |
| Workflow | 工作流 |
| Stage | 阶段 |
| Gate | 关卡 |
| Skill | 技能 |
| Agent | Agent |
| Agent source (Installed / Bundled) | Agent 来源（已安装 / 内置） |
| Stint | Stint |
| Brief | 简报 |
| Handoff | 交接 |
| Checkpoint | 检查点 |
| Permission level | 权限级别（问询 / 自由编辑 / 自主） |
| Attention item | 待处理事项 |
| Needs you | 待你处理 |
| Project memory | 项目记忆 |
| Memory proposal | 记忆提案 |
| Decision record | 决策记录 |
| View / Pipeline | 视图 / 流水线 |
