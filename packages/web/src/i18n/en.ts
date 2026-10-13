// SPDX-License-Identifier: Apache-2.0
export const en = {
  connection: {
    workbench: "Stintwork · Local project workbench",
    opening: "Opening your project",
    unavailable: "Connection unavailable. Retrying automatically…",
    reading: "Reading project files…",
  },
  topBar: {
    language: "Language",
    needsYou: "Needs you",
    openPalette: "Open command palette",
    jumpTo: "Jump to…",
    milestone: "Milestone",
    all: "All",
    warnings: "Warnings",
    setup: "Setup",
    projectWarnings: "Project warnings",
    projectSetup: "Project setup",
    project: "Project",
    noWarnings: "No warnings. Project files are readable.",
    ticketGuide: "Ticket tracking guide",
    markdownTracking: "Local Markdown tracking",
    convention: " convention",
    agentInstructions: "Agent instructions",
    or: " or ",
    glossary: "Glossary",
    decisionRecords: "Decision records",
    found: "Found",
    missing: "Missing",
    readOnly: "Read-only · No files are changed.",
  },
  board: {
    workbench: "Stintwork · Project workbench",
    pipeline: "Pipeline",
    description: "Your work, from first question to shipped.",
    live: "Live",
    connecting: "Connecting live updates",
    reconnecting: "Reconnecting · Reading project periodically",
    lastAvailable: " Showing the last available project; retrying automatically.",
    allMilestones: "All milestones",
    counts: (active: number, shipped: number) => `${active} active · ${shipped} shipped`,
    createWorkItem: "Create work item",
    stageNavigation: "Stage navigation",
    previousStages: "Previous stages",
    nextStages: "Next stages",
    stages: "Pipeline stages",
    empty: "No work items yet",
    startWithSpec: "Start with a spec in ",
    addTickets: "Add tickets in ",
    updatesAsYouEdit: ". The Pipeline updates as you edit.",
    emptyMilestone: "No work items in this milestone.",
    unstaged: "Work items without a stage",
    unstagedCount: (count: number) => `Work items without a stage · ${count}`,
    shipped: "Shipped",
    emptyShipped: "No shipped work items yet.",
  },
  column: {
    hints: {
      clarify: "Find the right problem",
      spec: "Agree on the outcome",
      tickets: "Slice the implementation",
      implement: "Make it work",
      review: "Prove it is ready",
      ship: "Ready to merge",
    },
    empty: (name: string) => `No work items in ${name}.`,
  },
  card: {
    feature: "Feature",
    bug: "Bug",
    quick: "Quick work item",
    effort: "Effort",
    openTickets: "Some tickets are open.",
    resolvedTickets: "All tickets are resolved.",
    specOnly: "A spec exists, with no tickets yet.",
    noFiles: "No spec or tickets exist yet.",
    open: (slug: string, title: string) => `Open ${slug}: ${title}`,
    running: "Stint running",
    shipped: "Shipped",
    attention: (count: number) => `${count} open attention items`,
    needsYou: (count: number) => `Needs you · ${count}`,
    blocked: "Blocked",
    inferred: "Inferred",
    inference: "Stage inferred from project files because no valid workflow.yaml declares it. ",
    bugInference: " The work item slug selects the Bug workflow.",
    resolved: "resolved ",
    tickets: "tickets",
    progress: (slug: string) => `${slug} resolved tickets`,
  },
  workflows: {
    feature: {
      name: "Feature",
      stages: {
        clarify: "Clarify",
        spec: "Spec",
        tickets: "Tickets",
        implement: "Implement",
        review: "Review",
        ship: "Ship",
      },
    },
    bug: {
      name: "Bug",
      stages: { diagnose: "Diagnose", fix: "Fix", review: "Review", ship: "Ship" },
    },
    quick: { name: "Quick", stages: { do: "Do", review: "Review", ship: "Ship" } },
  },
};

type Messages<Source> = {
  [Key in keyof Source]: Source[Key] extends (...args: infer Args) => string
    ? (...args: Args) => string
    : Source[Key] extends string
      ? string
      : Messages<Source[Key]>;
};

export type Catalog = Messages<typeof en>;
