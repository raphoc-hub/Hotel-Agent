---
name: run-eval
description: Evaluate the hotel agent. Use when asked to evaluate the app, run the eval, score the agent, or check whether a change helped. Runs npm run eval, compares the result with the previous run in eval/results, lists the cases whose score changed, and suggests one change to the system prompt without making it.
---

# Run the eval

When I ask you to evaluate the app:

1. Run `npm run eval`. It runs the six cases in `eval/cases.csv` at the same time and writes a new file `eval/results/<date>-<time>.md`. Run it once only; the class shares one API key, so don't loop it. If it fails with a rate limit (429) or overloaded (529) error, tell me and stop.
2. Find the previous file in `eval/results/` (the newest one before the file this run wrote; the names sort by time). If there is none, say this is the first run and skip to step 4.
3. Compare the two tables by `id`. List only the cases whose score changed, as: id, old score -> new score, and one line on why, taken from the judge's sentence. Give the average score of both runs.
4. Suggest exactly one change to the system prompt (`server/system-prompt.txt`) that would most likely raise the lowest scores. Quote the line you would change and the new wording. Don't make the change; AGENTS.md says not to edit the system prompt unless I ask.
