const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("content.js", "utf8");
const failures = [];

function extractFunction(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Missing function ${name}`);
  }
  const paramsEnd = source.indexOf(")", start);
  const braceStart = source.indexOf("{", paramsEnd);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Could not extract function ${name}`);
}

function runTableFunction(functionName, recordsExpression) {
  const fnSource = extractFunction(functionName);
  const headerMatch = source.match(/const TABLE_HEADERS = \[[\s\S]*?\];/);
  if (!headerMatch) throw new Error("Missing TABLE_HEADERS");
  const helperSource = `${headerMatch[0]}\n${extractFunction("tableRow")}\n${fnSource}`;
  const sandbox = {
    state: {
      records: [
        {
          time: "2026-06-18T00:00:00.000Z",
          query: "AI sales",
          result: "已收藏",
          processingStatus: "已收藏",
          recommendedAction: "已自动收藏",
          needsReview: "否",
          mainReason: "匹配",
          ruleVersion: 1,
          score: 88,
          title: "AI销售",
          companyScale: "100-499人",
          cardText: "card",
          hits: "AI",
          negatives: "",
          filterNotes: "",
          reviewNotes: "",
          decisionLog: "decision",
          detailMatched: "是：title",
          detailChanged: "是",
          detailHrefMatched: "否",
          favoriteResult: "收藏成功",
          favoriteButtonText: "已收藏",
          greetingResult: "未开启",
          href: "https://www.zhipin.com/job_detail/abc.html"
        }
      ]
    }
  };
  const code = `
    function actionLabel(action) { return action || ""; }
    function currentCampaignKeywordLabel() { return "AI sales"; }
    function currentCompanyScaleLabel() { return "100-499人"; }
    function norm(text) { return (text || "").replace(/\\s+/g, " ").trim(); }
    ${helperSource}
    result = ${functionName}(${recordsExpression || ""});
  `;
  vm.runInNewContext(code, sandbox);
  return sandbox.result.split("\n").map(row => row.split("\t"));
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    failures.push(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(text, expected, message) {
  if (!text.includes(expected)) {
    failures.push(`${message}: missing ${expected}`);
  }
}

const tableRows = runTableFunction("tableText");
assertEqual(tableRows[0].length, tableRows[1].length, "tableText header/data column count");
assertEqual(tableRows[0].indexOf("详情匹配"), tableRows[1].indexOf("是：title"), "tableText detailMatched column");
assertEqual(tableRows[0].indexOf("收藏状态"), tableRows[1].indexOf("收藏成功"), "tableText favoriteResult column");

const filteredRows = runTableFunction("tableTextFor", "state.records");
assertEqual(filteredRows[0].length, filteredRows[1].length, "tableTextFor header/data column count");
assertEqual(filteredRows[0].indexOf("详情匹配"), filteredRows[1].indexOf("是：title"), "tableTextFor detailMatched column");
assertEqual(filteredRows[0].indexOf("收藏状态"), filteredRows[1].indexOf("收藏成功"), "tableTextFor favoriteResult column");

const clickJobCardSource = extractFunction("clickJobCard");
assertIncludes(clickJobCardSource, "preventDefault", "clickJobCard should prevent link navigation");

const startSource = extractFunction("start");
assertIncludes(startSource, "start_blocked_missing_ai_key", "start should block scanning without a saved API key");
assertIncludes(startSource, "aiConfigured()", "start should check AI configuration before scanning");

const processJobSource = extractFunction("processJob");
assertIncludes(processJobSource, "judgeJobWithLlm", "processJob should require LLM judgement");
assertIncludes(processJobSource, "llmResult.action", "processJob should use LLM action for the final decision");
assertIncludes(processJobSource, "llmResult.score", "processJob should use LLM score for the final decision");

const scanLoopSource = extractFunction("start");
assertIncludes(scanLoopSource, "err instanceof LlmJudgementError", "scan loop should pause on LLM judgement failure");
assertIncludes(scanLoopSource, "llm_judgement_failed", "scan loop should persist LLM failure state");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("regression checks passed");
