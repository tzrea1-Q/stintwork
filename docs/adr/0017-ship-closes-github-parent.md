# Ship closes the GitHub parent issue

Status: accepted 2026-11-08 by the maintainer.

During the exit, parent issue #1 stayed open after PR #4 merged because the PR body had no closing keyword.

When Stintwork opens a pull request for a GitHub-tracked work item in the same repository, its generated body includes `Closes #N` for the parent issue. The confirmation preview shows that body. Local Markdown work items are unchanged.

GitHub closes the parent only when the pull request merges into the default branch; merging elsewhere does not close it. Agents close tickets during their stints, not through the pull request. This adds no issue write path to Stintwork.

When adopting an existing pull request, the preview shows its actual body and warns if it lacks a closing reference to the parent; Stintwork does not edit that body.
