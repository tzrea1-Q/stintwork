# Browser checks

Run `pnpm --filter @stintwork/web... build` once, then `pnpm test:e2e` from the repo root.
Local runs use installed Google Chrome (`PLAYWRIGHT_CHROME_CHANNEL=chrome`); CI uses bundled Chromium.
CI installs it with `pnpm --filter @stintwork/web exec playwright install --with-deps chromium`.

The harness launches the real server from source using `sourceNodeArgs`, serves `packages/web/dist`,
and copies `fixtures/project` and `fixtures/github-project` into separate temporary git repositories.
The GitHub fixture is written from scratch and exercises Project setup against a declared tracker,
not the contents of any real project. The harness skips agent detection and removes both repositories
and stops both servers on shutdown. No login or external network is needed.
Use `PLAYWRIGHT_PORT` to change the default ports (4178 and the following port); no existing server is reused.

`assertLayout` checks document overflow, visible portalled overlays (16px gutters), and clipped text
within its `region` (default `body`). Deliberate truncation requires `data-truncate` and a `title`
containing the complete text. Code and diffs may scroll within their own containers.
Board checks inspect `.pipeline-main`; top-bar text and existing top-bar panels belong to ticket 02.
Screenshots go to `packages/web/coverage/e2e/test-results`, and the HTML report to
`packages/web/coverage/e2e/report`. These generated artifacts use the existing ignored `coverage` tree.
