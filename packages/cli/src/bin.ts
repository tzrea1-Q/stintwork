#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { startCli } from "./cli.js";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  version: string;
};
await startCli(process.argv.slice(2), version);
