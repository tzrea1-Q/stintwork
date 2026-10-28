// SPDX-License-Identifier: Apache-2.0
import { CoreTextError, readResponseJson } from "./i18n/language";

export async function refreshGithubItem(number: number, fallback: string) {
  try {
    const response = await fetch(`/api/github/items/${number}/refresh`, { method: "POST" });
    if (!response.ok) throw new CoreTextError(await readResponseJson(response), fallback);
  } finally {
    window.dispatchEvent(new Event("stintwork:refresh-project"));
  }
}
