// SPDX-License-Identifier: Apache-2.0
import { expect, type Page } from "@playwright/test";

export async function assertOverviewCards(page: Page) {
  const result = await page.evaluate(() => {
    const columns = [...document.querySelectorAll("main [data-overview-column]")];
    const cards = columns.map((column) => [
      ...column.querySelectorAll(':scope > [data-slot="card"]'),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas for colour contrast checks");
    const luminance = (color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const colors = ["bg-running", "bg-attention", "bg-stopped"].map((name) => {
      const swatches = [...document.querySelectorAll(`[data-stage-swatch].${name}`)];
      const segments = [
        ...document.querySelectorAll(`main div[role="img"].bg-muted > span.${name}`),
      ];
      return {
        name,
        swatches: swatches.map((swatch) => getComputedStyle(swatch).backgroundColor),
        segments: segments.map((segment) => {
          const color = getComputedStyle(segment).backgroundColor;
          const parent = segment.parentElement;
          if (!parent) throw new Error(`Missing track for ${name}`);
          const track = getComputedStyle(parent).backgroundColor;
          const a = luminance(color);
          const b = luminance(track);
          return { color, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        }),
      };
    });
    return {
      columns: cards.map((column) => column.length),
      sizes: cards.flat().map((card) => {
        const last = card.lastElementChild;
        if (!last) throw new Error("Overview card has no content");
        return {
          label: card.textContent?.trim().slice(0, 80),
          excess:
            card.getBoundingClientRect().bottom -
            (last.getBoundingClientRect().bottom +
              parseFloat(getComputedStyle(card).paddingBottom)),
        };
      }),
      tracks: document.querySelectorAll('main div[role="img"].bg-muted').length,
      headers: cards
        .filter((column) => column.length)
        .map(
          (column) =>
            column[0].querySelector(':scope > [data-slot="card-header"]')?.getBoundingClientRect()
              .top ?? null,
        ),
      colors,
    };
  });

  expect(result.columns.length, "Overview should have columns").toBeGreaterThan(0);
  const count = result.columns.reduce((sum, length) => sum + length, 0);
  expect(count, "Overview should have cards").toBeGreaterThan(0);
  result.columns.forEach((length, index) => {
    if (length === 0) {
      expect(count, `Empty column ${index + 1} requires fewer cards than columns`).toBeLessThan(
        result.columns.length,
      );
      expect(
        result.columns.slice(index + 1).every((remaining) => remaining === 0),
        `Empty column ${index + 1} must follow all non-empty columns`,
      ).toBe(true);
    }
  });
  for (const card of result.sizes) {
    expect(
      card.excess,
      `Card ${card.label} has too much space below its content`,
    ).toBeLessThanOrEqual(24);
  }
  for (const [index, top] of result.headers.entries()) {
    expect(top, `First card in non-empty column ${index + 1} must have a header`).not.toBeNull();
    if (top === null || result.headers[0] == null) continue;
    expect(
      Math.abs(top - result.headers[0]),
      `First card header in non-empty column ${index + 1} is misaligned`,
    ).toBeLessThanOrEqual(1);
  }
  for (const { name, swatches, segments } of result.colors) {
    if (
      !result.tracks &&
      !result.colors.some((entry) => entry.swatches.length || entry.segments.length)
    )
      continue;
    expect(swatches.length, `Missing ${name} legend swatch`).toBeGreaterThan(0);
    expect(segments.length, `Missing ${name} bar segments`).toBeGreaterThan(0);
    for (const swatch of swatches) {
      for (const segment of segments) {
        expect(segment.color, `${name} swatch must match its bar segment`).toBe(swatch);
        expect(
          segment.contrast,
          `${name} bar must contrast with its track by at least 3:1`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  }
}
