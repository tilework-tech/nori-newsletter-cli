#!/usr/bin/env node
// Cut a nori-newsletter-cli release by pushing a `newsletter-cli-v<version>`
// tag, which triggers .github/workflows/newsletter-cli-release.yml to publish
// to npm via OIDC Trusted Publishing.
//
// Usage: npm run release -- <version>       e.g. npm run release -- 1.1.0
//
// package.json carries a placeholder version (0.0.0); the tag is the source of
// truth for the released version.

import { execFileSync } from "node:child_process";
import { releaseTagFor } from "./release-tag.mjs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const version = process.argv[2];
if (!version) {
  fail("Usage: npm run release -- <version>   (e.g. npm run release -- 1.1.0)");
}

let tag;
try {
  tag = releaseTagFor(version);
} catch (err) {
  fail(err.message);
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") {
  fail(`Refusing to release from "${branch}": releases are cut from main.`);
}

if (git(["status", "--porcelain"])) {
  fail("Refusing to release: working tree is not clean. Commit or stash first.");
}

git(["fetch", "origin", "main", "--tags"]);
if (git(["rev-parse", "HEAD"]) !== git(["rev-parse", "origin/main"])) {
  fail("Refusing to release: local main is out of sync with origin/main. Pull/push first.");
}

if (git(["tag", "--list", tag])) {
  fail(`Tag ${tag} already exists.`);
}

git(["tag", "-a", tag, "-m", `nori-newsletter-cli release ${version}`]);
git(["push", "origin", tag]);

console.log(
  `Pushed ${tag}. The release workflow will publish nori-newsletter-cli@${version} to npm.`
);
