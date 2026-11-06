// The agent: sends the guest's message to the model, runs the tools it asks
// for, and saves one row per message in data/requests.json.
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

export const MODEL = "claude-sonnet-5-5";
const MAX_STEPS = 5;

const ROOT = path.join(import.meta.dirname, "..");
const REQUESTS_FILE = path.join(ROOT, "data", "requests.json");
const BOOKINGS_FILE = path.join(ROOT, "data", "bookings.csv");

// System prompt: the instructions in system-prompt.txt, then the hotel
// policies as context. Read once, when the server starts.
const INSTRUCTIONS = fs.readFileSync(path.join(import.meta.dirname, "system-prompt.txt"), "utf8").trim();
const POLICIES = fs.readFileSync(path.join(ROOT, "hotel-policies.md"), "utf8").trim();
export const SYSTEM_PROMPT = `${INSTRUCTIONS}\n\n# Hotel policies\n\n${POLICIES}`;

const DEPARTMENTS = [
  "Reservations",
  "Billing & Payments",
  "Front Desk & Guest Services",
  "Housekeeping & Maintenance",
  "Restaurant & Events",
  "Complaints & Feedback",
];

const TOOLS = [
  {
    name: "log_request",
    description:
      "Records the request in the hotel's log. Call it exactly once per guest message, before your final answer.",
    input_schema: {
      type: "object",
      properties: {
        department: { type: "string", enum: DEPARTMENTS },
        urgency: { type: "string", enum: ["high", "normal"] },
        summary: { type: "string" },
        status: { type: "string", enum: ["ANSWERED", "ESCALATED"] },
      },
      required: ["department", "urgency", "summary", "status"],
    },
  },
  {
    name: "lookup_booking",
    description:
      "Returns the guest's own reservation: dates, room type, breakfast, rate and payment status, or that no booking was found. Use it only when the answer depends on the guest's booking.",
    // No input: the backend passes the e-mail from the form, never the model.
    input_schema: { type: "object", properties: {} },
  },
];

// The SDK reads ANTHROPIC_API_KEY from the environment (loaded from .env).
const client = new Anthropic();

// Finds the booking whose e-mail equals the e-mail from the form.
export function lookupBooking(email) {
  const [header, ...lines] = fs.readFileSync(BOOKINGS_FILE, "utf8").trim().split("\n");
  const columns = header.split(",");
  for (const line of lines) {
    const values = line.split(",");
    const row = Object.fromEntries(columns.map((col, i) => [col, values[i]]));
    if (row.email.toLowerCase() === email.toLowerCase()) {
      return JSON.stringify(row);
    }
  }
  return JSON.stringify({ found: false });
}

function textOf(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function saveRequest(row) {
  const rows = JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf8"));
  rows.push(row);
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(rows, null, 2) + "\n");
}

// Runs one guest message through the agent loop.
// With stubLog (used by the eval), nothing is written to data/requests.json.
export async function runAgent({ name, email, message }, { stubLog = false } = {}) {
  let logged = null; // the four fields from log_request, once it has been called
  const toolResults = []; // every tool call with its full result
  const trace = []; // one entry per step, saved with the request

  function runTool(toolUse) {
    if (toolUse.name === "log_request") {
      // At most one log_request per message, enforced here in code.
      if (logged) return "already logged";
      const { department, urgency, summary, status } = toolUse.input;
      logged = { department, urgency, summary, status };
      return JSON.stringify({ ok: true });
    }
    if (toolUse.name === "lookup_booking") {
      return lookupBooking(email);
    }
    return `unknown tool: ${toolUse.name}`;
  }

  const messages = [
    { role: "user", content: `Name: ${name}\nE-mail: ${email}\nMessage: ${message}` },
  ];
  let finalText = "";

  for (let step = 1; step <= MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });
    const toolUses = response.content.filter((block) => block.type === "tool_use");
    trace.push({
      type: "model",
      step,
      stop_reason: response.stop_reason,
      asked_for_tool: toolUses.length > 0,
    });

    // No tool call: the model has answered with text, so the loop ends.
    if (toolUses.length === 0) {
      finalText = textOf(response);
      break;
    }

    // Run every tool the model asked for and send all the results back.
    messages.push({ role: "assistant", content: response.content });
    const results = [];
    for (const toolUse of toolUses) {
      const result = runTool(toolUse);
      toolResults.push({ name: toolUse.name, arguments: toolUse.input, result });
      const entry = {
        type: "tool",
        name: toolUse.name,
        arguments: toolUse.input,
        result: result.slice(0, 200),
      };
      if (stubLog && toolUse.name === "log_request") entry.stubbed = true;
      trace.push(entry);
      results.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
    }
    messages.push({ role: "user", content: results });
  }

  const notes = [];
  if (!finalText) {
    notes.push("no final text from the model");
    finalText = "Thank you for your message. A member of our team will reply to you by e-mail.";
  }
  trace.push({ type: "answer", text: finalText });

  // If the model never called log_request, the row is still saved, as ESCALATED.
  if (!logged) notes.push("no log_request call");
  const row = {
    time: new Date().toISOString(),
    name,
    email,
    message,
    department: logged ? logged.department : "",
    urgency: logged ? logged.urgency : "",
    summary: logged ? logged.summary : "",
    status: logged ? logged.status : "ESCALATED",
    reply: finalText,
  };
  if (notes.length) row.note = notes.join("; ");
  row.trace = trace;

  if (!stubLog) saveRequest(row);
  return { reply: finalText, row, toolResults };
}
