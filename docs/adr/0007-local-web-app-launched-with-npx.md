# Stintwork is a local web app launched with npx

`npx stintwork` in a repo starts a local server and opens the UI in the browser. We chose this over a desktop app (Tauri or Electron) because it's fastest to build and change, needs no install or signing, and matches how similar local tools (Backlog.md, Vibe Kanban) ship. The UI is written so it can be wrapped as a desktop app later if notifications or a dock icon matter.
