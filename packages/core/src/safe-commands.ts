// SPDX-License-Identifier: Apache-2.0
const inspectionOptions: Record<string, RegExp> = {
  cat: /^(?:-[benstuvET]+|--(?:number|number-nonblank|squeeze-blank|show-all|show-ends|show-tabs|show-nonprinting))$/,
  ls: /^(?:-[aAbBcCdDfFgGhHiIklmMnNopqQrRsStTuUvwx1]+|--(?:all|almost-all|directory|human-readable|recursive|size|color(?:=(?:always|auto|never))?))$/,
  head: /^(?:-[qv]|-\d+|--(?:quiet|verbose)|--(?:lines|bytes)=\d+)$/,
  tail: /^(?:-[qv]|-\d+|--(?:quiet|verbose)|--(?:lines|bytes)=\d+)$/,
  grep: /^(?:-[EFGivwxcLlnHhosrq]+|--(?:extended-regexp|fixed-strings|ignore-case|invert-match|word-regexp|line-regexp|count|files-without-match|files-with-matches|line-number|with-filename|no-filename|only-matching|quiet|recursive))$/,
  rg: /^(?:-[FivwxclnoqsuU]+|--(?:files|hidden|line-number|no-heading|count|files-with-matches|files-without-match|fixed-strings|ignore-case|invert-match|word-regexp|quiet|no-ignore|no-ignore-vcs|stats)|--color=(?:always|auto|never))$/,
  wc: /^(?:-[clmwL]+|--(?:bytes|chars|lines|words|max-line-length))$/,
};

function inspectionPaths(binary: string, args: string[]): string[] | null {
  const paths: string[] = [];
  let operands = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!operands && arg === "--") {
      operands = true;
    } else if (
      !operands &&
      ((["head", "tail"].includes(binary) && ["-n", "-c", "--lines", "--bytes"].includes(arg)) ||
        (["grep", "rg"].includes(binary) && ["-A", "-B", "-C", "-m"].includes(arg)))
    ) {
      if (!/^\d+$/.test(args[++index] ?? "")) return null;
    } else if (!operands && arg.startsWith("-")) {
      if (arg !== "-" && !inspectionOptions[binary].test(arg)) return null;
    } else paths.push(arg);
  }
  return paths;
}

function checkPaths(words: string[]): string[] | null {
  let [binary, ...args] = words;
  if (binary === "pnpm") {
    while (
      ["-r", "--recursive", "--offline", "--config.verify-deps-before-run=false"].includes(args[0])
    )
      args = args.slice(1);
    if (args[0] === "run")
      return args.length === 2 &&
        ["test", "lint", "typecheck", "format:check", "build"].includes(args[1])
        ? []
        : null;
    if (["test", "lint", "typecheck", "format:check", "build"].includes(args[0]))
      return args.length === 1 ? [] : null;
    if (args[0] === "exec") args = args.slice(1);
    [binary, ...args] = args;
  }
  if (binary === "vitest") {
    if (args[0] === "run" || args[0] === "--run") args = args.slice(1);
    else return null;
    return args.every((arg) => !arg.startsWith("-")) ? args : null;
  }
  if (binary === "tsc") {
    if (!args.includes("--noEmit")) return null;
    const paths: string[] = [];
    for (let index = 0; index < args.length; index++) {
      if (["--noEmit", "--pretty", "--skipLibCheck"].includes(args[index])) continue;
      if (["-p", "--project"].includes(args[index]) && args[index + 1]) paths.push(args[++index]);
      else return null;
    }
    return paths;
  }
  if (binary === "biome" && ["check", "lint", "format"].includes(args[0]))
    return args.slice(1).every((arg) => !arg.startsWith("-")) ? args.slice(1) : null;
  return null;
}

function commandPaths(words: string[]): string[] | null {
  const [binary, ...args] = words;
  if (binary === "echo") return [];
  if (
    args.length === 1 &&
    ((args[0] === "--version" && ["node", "pnpm", "git"].includes(binary)) ||
      (args[0] === "-v" && ["node", "pnpm"].includes(binary)))
  )
    return [];
  if (Object.hasOwn(inspectionOptions, binary)) return inspectionPaths(binary, args);
  if (binary === "sed")
    return args[0] === "-n" &&
      /^(?:\d+|\$)(?:,(?:\d+|\$))?p$/.test(args[1] ?? "") &&
      args.slice(2).every((arg) => !arg.startsWith("-"))
      ? args.slice(2)
      : null;
  if (binary === "git" && ["status", "diff", "log", "show"].includes(args[0])) {
    const paths: string[] = [];
    let operands = false;
    for (const arg of args.slice(1)) {
      if (!operands && arg === "--") operands = true;
      else if (!operands && arg.startsWith("-")) {
        if (
          !/^(?:-[psbu]+|-\d+|--(?:short|branch|porcelain(?:=v[12])?|stat|numstat|shortstat|name-only|name-status|summary|patch|no-patch|cached|staged|no-index|oneline|no-decorate|no-color|no-ext-diff|no-textconv|exit-code|quiet|check)|--(?:max-count|unified)=\d+)$/.test(
            arg,
          )
        )
          return null;
      } else paths.push(arg);
    }
    return paths;
  }
  return checkPaths(words);
}

export function safeCommandPaths(command: unknown): string[] | null {
  const forbidden = /[\p{Cc}$`~\\(){}*?[\]#]/u;
  if (Array.isArray(command))
    return command.length > 0 &&
      command.every(
        (arg) => typeof arg === "string" && !forbidden.test(arg) && !/[|&<>;]/.test(arg),
      )
      ? commandPaths(command)
      : null;
  if (
    typeof command !== "string" ||
    !command.trim() ||
    forbidden.test(command.replaceAll("$?", ""))
  )
    return null;
  const tokens = /2>&1(?= |\||&&|;|$)|(?:[^ "'|&<>;]+|"[^"\n]*"|'[^'\n]*')+|&&|\||;/gy;
  const paths: string[] = [];
  let words: string[] = [];
  let stderrRedirected = false;
  let offset = 0;
  while (offset < command.length) {
    if (command[offset] === " ") {
      offset++;
      continue;
    }
    tokens.lastIndex = offset;
    const token = tokens.exec(command)?.[0];
    if (!token) return null;
    offset = tokens.lastIndex;
    if (token === "&&" || token === "|" || token === ";") {
      const targets = commandPaths(words);
      if (targets === null) return null;
      paths.push(...targets);
      words = [];
      stderrRedirected = false;
    } else if (token === "2>&1") {
      if (!words.length || stderrRedirected) return null;
      stderrRedirected = true;
    } else {
      if (stderrRedirected || /[<>]/.test(token)) return null;
      if (
        token.includes("$") &&
        (words[0] !== "echo" || (token !== "$?" && !/^"[^"]*\$\?[^"]*"$/.test(token)))
      )
        return null;
      words.push(token.replace(/"([^"]*)"|'([^']*)'/g, "$1$2"));
    }
  }
  const targets = commandPaths(words);
  return targets === null ? null : [...paths, ...targets];
}
