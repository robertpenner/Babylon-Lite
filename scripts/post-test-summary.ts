/**
 * Post a test summary as a GitHub PR comment.
 *
 * Parses JUnit XML files and posts a markdown table of results
 * (pass/fail counts + failure details) as a comment on the PR.
 *
 * Env:
 *   GITHUB_TOKEN          — PAT or pipeline-provided token with repo scope
 *   GITHUB_REPOSITORY     — owner/repo (e.g. BabylonJS/Babylon-Lite)
 *   PR_NUMBER             — pull request number
 *   JUNIT_FILES           — comma-separated paths to JUnit XML files
 *   COMMENT_TAG           — unique tag to identify/update the comment (default: test-summary)
 *
 * Usage: tsx scripts/post-test-summary.ts
 */
import { readFileSync, existsSync } from "fs";

// ── Config ─────────────────────────────────────────────────────────

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const prNumber = process.env.PR_NUMBER;
const junitFiles = (process.env.JUNIT_FILES ?? "").split(",").map((f) => f.trim()).filter(Boolean);
const commentTag = process.env.COMMENT_TAG ?? "test-summary";

if (!token || !repo || !prNumber || junitFiles.length === 0) {
    console.log("Missing required env vars (GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, JUNIT_FILES). Skipping.");
    process.exit(0);
}

// ── JUnit XML parsing (minimal, no dependency) ─────────────────────

interface TestCase {
    name: string;
    classname: string;
    time: number;
    failure?: string;
    error?: string;
}

interface TestSuite {
    name: string;
    tests: number;
    failures: number;
    errors: number;
    time: number;
    testcases: TestCase[];
}

function parseJunit(xml: string): TestSuite[] {
    const suites: TestSuite[] = [];

    // Match <testsuite> elements
    const suiteRegex = /<testsuite\s([^>]+)>([\s\S]*?)<\/testsuite>/g;
    let suiteMatch;
    while ((suiteMatch = suiteRegex.exec(xml)) !== null) {
        const attrs = suiteMatch[1];
        const body = suiteMatch[2];

        const suite: TestSuite = {
            name: attr(attrs, "name"),
            tests: Number(attr(attrs, "tests")) || 0,
            failures: Number(attr(attrs, "failures")) || 0,
            errors: Number(attr(attrs, "errors")) || 0,
            time: Number(attr(attrs, "time")) || 0,
            testcases: [],
        };

        // Match <testcase> elements
        const caseRegex = /<testcase\s([^>]*?)\s*(?:\/>|>([\s\S]*?)<\/testcase>)/g;
        let caseMatch;
        while ((caseMatch = caseRegex.exec(body)) !== null) {
            const cAttrs = caseMatch[1];
            const cBody = caseMatch[2] ?? "";

            const tc: TestCase = {
                name: attr(cAttrs, "name"),
                classname: attr(cAttrs, "classname"),
                time: Number(attr(cAttrs, "time")) || 0,
            };

            // Check for <failure> or <error>
            const failMatch = cBody.match(/<failure[^>]*?(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/failure>/);
            if (failMatch) {
                tc.failure = failMatch[1] || failMatch[2]?.trim().slice(0, 500);
            }
            const errMatch = cBody.match(/<error[^>]*?(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/error>/);
            if (errMatch) {
                tc.error = errMatch[1] || errMatch[2]?.trim().slice(0, 500);
            }

            suite.testcases.push(tc);
        }

        suites.push(suite);
    }

    return suites;
}

function attr(str: string, name: string): string {
    const m = str.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : "";
}

// ── Build markdown ─────────────────────────────────────────────────

function buildMarkdown(allSuites: TestSuite[]): string {
    let totalTests = 0;
    let totalFails = 0;
    let totalErrors = 0;
    let totalTime = 0;

    for (const s of allSuites) {
        totalTests += s.tests;
        totalFails += s.failures;
        totalErrors += s.errors;
        totalTime += s.time;
    }

    const passed = totalTests - totalFails - totalErrors;
    const status = totalFails + totalErrors === 0 ? "✅" : "❌";
    const lines: string[] = [];

    lines.push(`## ${status} Test Results`);
    lines.push("");
    lines.push(`| Suite | Tests | Passed | Failed | Time |`);
    lines.push(`|-------|------:|-------:|-------:|-----:|`);

    for (const s of allSuites) {
        const sPassed = s.tests - s.failures - s.errors;
        const icon = s.failures + s.errors === 0 ? "✅" : "❌";
        lines.push(`| ${icon} ${s.name} | ${s.tests} | ${sPassed} | ${s.failures + s.errors} | ${s.time.toFixed(1)}s |`);
    }

    lines.push(`| **Total** | **${totalTests}** | **${passed}** | **${totalFails + totalErrors}** | **${totalTime.toFixed(1)}s** |`);
    lines.push("");

    // List failures
    const failures: TestCase[] = [];
    for (const s of allSuites) {
        for (const tc of s.testcases) {
            if (tc.failure || tc.error) {
                failures.push(tc);
            }
        }
    }

    if (failures.length > 0) {
        lines.push(`### Failed Tests (${failures.length})`);
        lines.push("");
        for (const tc of failures.slice(0, 20)) {
            const msg = tc.failure ?? tc.error ?? "Unknown error";
            lines.push(`<details><summary>❌ ${escapeHtml(tc.name)}</summary>`);
            lines.push("");
            lines.push("```");
            lines.push(msg.slice(0, 1000));
            lines.push("```");
            lines.push("</details>");
            lines.push("");
        }
        if (failures.length > 20) {
            lines.push(`_...and ${failures.length - 20} more failures. See pipeline artifacts for full details._`);
        }
    }

    lines.push(`<!-- ${commentTag} -->`);
    return lines.join("\n");
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── GitHub API ─────────────────────────────────────────────────────

const API = `https://api.github.com/repos/${repo}`;
const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "babylon-lite-ci",
};

async function findExistingComment(): Promise<number | null> {
    const res = await fetch(`${API}/issues/${prNumber}/comments?per_page=100`, { headers });
    if (!res.ok) return null;
    const comments = (await res.json()) as Array<{ id: number; body: string }>;
    const existing = comments.find((c) => c.body.includes(`<!-- ${commentTag} -->`));
    return existing?.id ?? null;
}

async function upsertComment(body: string): Promise<void> {
    const existingId = await findExistingComment();

    if (existingId) {
        const res = await fetch(`${API}/issues/comments/${existingId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error(`Failed to update comment: ${res.status} ${await res.text()}`);
        console.log(`Updated existing PR comment #${existingId}`);
    } else {
        const res = await fetch(`${API}/issues/${prNumber}/comments`, {
            method: "POST",
            headers,
            body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error(`Failed to create comment: ${res.status} ${await res.text()}`);
        console.log("Created new PR comment");
    }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
    const allSuites: TestSuite[] = [];

    for (const file of junitFiles) {
        if (!existsSync(file)) {
            console.log(`JUnit file not found: ${file} (skipping)`);
            continue;
        }
        const xml = readFileSync(file, "utf-8");
        allSuites.push(...parseJunit(xml));
    }

    if (allSuites.length === 0) {
        console.log("No test results found. Skipping PR comment.");
        return;
    }

    const markdown = buildMarkdown(allSuites);
    await upsertComment(markdown);
}

main().catch((err) => {
    console.error("Failed to post test summary:", err);
    process.exit(1);
});
