// Runs every case in eval/cases.csv through the agent, has the model grade
// each answer against eval/rubric.md, and writes the results to eval/results/.
// Run it with: npm run eval
import Anthropic from "@anthropic-ai/sdk";
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";
import { runAgent, MODEL } from "../server/agent.js";

const EVAL_DIR = import.meta.dirname;
const ROOT = path.join(EVAL_DIR, "..");
const RESULTS_DIR = path.join(EVAL_DIR, "results");

const cases = parse(fs.readFileSync(path.join(EVAL_DIR, "cases.csv"), "utf8"), { columns: true });
const rubric = fs.readFileSync(path.join(EVAL_DIR, "rubric.md"), "utf8").trim();
const policies = fs.readFileSync(path.join(ROOT, "hotel-policies.md"), "utf8").trim();

const client = new Anthropic();

// The grade comes back in this exact shape (structured output), not as free text.
const GRADE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", enum: [1, 2, 3, 4, 5] },
    sentence: { type: "string" },
  },
  required: ["score", "sentence"],
  additionalProperties: false,
};

async function grade(testCase, result) {
  const output = {
    logged: {
      department: result.row.department,
      urgency: result.row.urgency,
      summary: result.row.summary,
      status: result.row.status,
    },
    final_text: result.reply,
    tool_results: result.toolResults,
  };
  const prompt = [
    rubric,
    `# Hotel policies\n\n${policies}`,
    `# The case\n\nGuest name: ${testCase.name}\nGuest e-mail: ${testCase.email}\nGuest message: ${testCase.message}`,
    `# Expected behaviour\n\n${testCase.expected}`,
    `# The assistant's output\n\n${JSON.stringify(output, null, 2)}`,
  ].join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: { type: "json_schema", schema: GRADE_SCHEMA } },
  });
  const text = response.content.find((block) => block.type === "text");
  return JSON.parse(text.text);
}

// One case: run the agent with log_request stubbed, then grade the answer.
async function runCase(testCase) {
  try {
    const result = await runAgent(
      { name: testCase.name, email: testCase.email, message: testCase.message },
      { stubLog: true },
    );
    const { score, sentence } = await grade(testCase, result);
    return { ...testCase, outcome: `${result.row.status}: ${result.reply}`, score, sentence };
  } catch (err) {
    return { ...testCase, outcome: "error", score: "-", sentence: `Error: ${err.message}` };
  }
}

// Markdown table cells: no line breaks, and | would break the table.
function cell(value) {
  return String(value).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
}

const results = await Promise.all(cases.map(runCase)); // all cases at the same time

const lines = [
  "| id | message | expected | outcome | score | sentence |",
  "| --- | --- | --- | --- | --- | --- |",
  ...results.map((r) =>
    `| ${[r.id, r.message, r.expected, r.outcome, r.score, r.sentence].map(cell).join(" | ")} |`,
  ),
];
const scores = results.map((r) => r.score).filter((s) => typeof s === "number");
const average = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : "-";
const table = `# Eval run ${new Date().toLocaleString("en-GB")}\n\nModel: ${MODEL}. Average score: ${average} (${scores.length} of ${results.length} cases graded).\n\n${lines.join("\n")}\n`;

// One new file per run, e.g. eval/results/2026-11-06-183512.md
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
fs.mkdirSync(RESULTS_DIR, { recursive: true });
const file = path.join(RESULTS_DIR, `${stamp}.md`);
fs.writeFileSync(file, table);

console.log(table);
console.log(`Saved to ${path.relative(ROOT, file)}`);
