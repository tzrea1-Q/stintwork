export function clearAgentTestEnvironment(env: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(env)) {
    if (key === "AI_AGENT" || /^(CLAUDE|CODEX|GROK|STINTWORK_FAKE_)/.test(key)) delete env[key];
  }
}

clearAgentTestEnvironment(process.env);
