/**
 * One word for one thing, and the word is `item`.
 *
 * `node` is graph vocabulary. It kept creeping back into user-facing strings
 * even after they had been cleaned by hand, because the identifiers carried it
 * too, so this test fails when it appears anywhere in the source.
 *
 * Comments are skipped on purpose: a few of them have to name the old stored
 * field to explain why a file written before 0.8.0 no longer loads.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOTS = [path.resolve("src"), path.resolve("scripts")];
const FORBIDDEN = /node/i;
/** `node:fs` is a module specifier, not vocabulary. The runtime name is in a comment. */
const MODULE_SPECIFIER = /node:/g;

/** Every source file under the roots, except the tests themselves. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "test" && entry !== "node_modules") found.push(...sourceFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/** Cut a line comment, but not a `//` inside a string. */
function stripLineComment(line: string): string {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote && line[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "/" && line[index + 1] === "/") return line.slice(0, index);
  }
  return line;
}

/** Drop block and line comments, keeping the code around them. */
function withoutComments(source: string): string {
  const kept: string[] = [];
  let inBlock = false;
  for (const line of source.split("\n")) {
    let text = line;
    if (inBlock) {
      const end = text.indexOf("*/");
      if (end < 0) continue;
      text = text.slice(end + 2);
      inBlock = false;
    }
    let open = text.indexOf("/*");
    while (open >= 0) {
      const close = text.indexOf("*/", open + 2);
      if (close < 0) {
        text = text.slice(0, open);
        inBlock = true;
        break;
      }
      text = text.slice(0, open) + text.slice(close + 2);
      open = text.indexOf("/*");
    }
    kept.push(stripLineComment(text));
  }
  return kept.join("\n");
}

describe("vocabulary", () => {
  it("calls a thing in the list an item, in the code and in the words", () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(root)) {
        withoutComments(readFileSync(file, "utf8"))
          .split("\n")
          .forEach((line, index) => {
            const code = line.replace(MODULE_SPECIFIER, "");
            if (FORBIDDEN.test(code)) {
              offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}  ${line.trim()}`);
            }
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
