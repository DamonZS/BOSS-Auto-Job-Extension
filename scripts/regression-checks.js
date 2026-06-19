const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("content.js", "utf8");
const backgroundSource = fs.readFileSync("background.js", "utf8");
const manifestSource = fs.readFileSync("manifest.json", "utf8");
const releaseWorkflowSource = fs.existsSync(".github/workflows/release.yml")
  ? fs.readFileSync(".github/workflows/release.yml", "utf8")
  : "";
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
if (clickJobCardSource.includes("stopPropagation")) {
  failures.push("clickJobCard should not stop click propagation because the site may rely on bubbled clicks to switch the detail panel");
}
assertIncludes(source, "function safeElementClick", "code should avoid executing javascript: URLs through native clicks");
assertIncludes(source, "isJavascriptHref", "safe click should detect javascript: hrefs");

const startSource = extractFunction("start");
assertIncludes(startSource, "start_blocked_missing_ai_key", "start should block scanning without a saved API key");
assertIncludes(startSource, "aiConfigured()", "start should check AI configuration before scanning");
assertIncludes(startSource, "alertMissingAiKey", "start should show a missing-key popup");

const processJobSource = extractFunction("processJob");
assertIncludes(processJobSource, "judgeJobWithLlm", "processJob should require LLM judgement");
assertIncludes(processJobSource, "llmResult.action", "processJob should use LLM action for the final decision");
assertIncludes(processJobSource, "llmResult.score", "processJob should use LLM score for the final decision");
assertIncludes(processJobSource, "job_detail_retry_click", "processJob should retry clicking before failing stale detail confirmation");
assertIncludes(processJobSource, "detailLogPayload", "processJob should log compact detail diagnostics");
const waitForJobDetailSource = extractFunction("waitForJobDetail");
assertIncludes(source, "function hasStrongDetailMismatch", "detail confirmation should detect strong detail mismatches");
assertIncludes(source, "function detailLogPayload", "detail confirmation should provide compact detail diagnostics");
assertIncludes(waitForJobDetailSource, "titleConfirmed", "detail confirmation should accept clear title matches without hrefs");
assertIncludes(waitForJobDetailSource, "!hasStrongDetailMismatch", "detail confirmation should keep code mismatch protection");
assertIncludes(waitForJobDetailSource, "snapshot.text.length > 160", "detail confirmation should require enough detail text for title-only confirmation");

const messageInputCandidatesSource = extractFunction("messageInputCandidates");
assertIncludes(messageInputCandidatesSource, "!x.el.closest(\"#boss-ai-autofav-panel\")", "message input detection should never target the assistant panel");
const tryAutoGreetingSource = extractFunction("tryAutoGreeting");
assertIncludes(tryAutoGreetingSource, "messageInputCandidates(detailRoot)", "auto greeting should search message inputs inside the right-side detail root first");
assertIncludes(tryAutoGreetingSource, "messageInputCandidates(document)", "auto greeting may fall back to document after excluding the assistant panel");
assertIncludes(tryAutoGreetingSource, "safeElementClick(greetButton.el)", "auto greeting should use safe click for greeting buttons");
assertIncludes(tryAutoGreetingSource, "safeElementClick(sendButton.el)", "auto greeting should use safe click for send buttons");
const hydratePanelFromCampaignSource = extractFunction("hydratePanelFromCampaign");
assertIncludes(source, "function campaignSearchKeywordsText", "campaign hydration should sanitize stored search keywords");
assertIncludes(hydratePanelFromCampaignSource, "campaignSearchKeywordsText()", "campaign hydration should not restore a greeting template into search keywords");

const clickFavoriteButtonSource = extractFunction("clickFavoriteButton");
assertIncludes(clickFavoriteButtonSource, "safeElementClick(before.el)", "favorite action should use safe click");
const searchKeywordOnPageSource = extractFunction("searchKeywordOnPage");
assertIncludes(searchKeywordOnPageSource, "safeElementClick(button.el)", "keyword search should use safe click");

const scanLoopSource = extractFunction("start");
assertIncludes(scanLoopSource, "err instanceof LlmJudgementError", "scan loop should pause on LLM judgement failure");
assertIncludes(scanLoopSource, "llm_judgement_failed", "scan loop should persist LLM failure state");

const generateSearchKeywordsSource = extractFunction("generateSearchKeywordsFromProfile");
assertIncludes(generateSearchKeywordsSource, "generateSearchKeywordsWithAi", "generate search keywords should call the LLM");
assertIncludes(generateSearchKeywordsSource, "generate_keywords_blocked_missing_ai_key", "generate search keywords should block without API key");
assertIncludes(generateSearchKeywordsSource, "alertMissingAiKey", "generate search keywords should show a missing-key popup");
if (generateSearchKeywordsSource.includes("searchKeywordsFromProfile()")) {
  failures.push("generate search keywords should not fall back to local searchKeywordsFromProfile()");
}
if (generateSearchKeywordsSource.includes("已改用本地规则")) {
  failures.push("generate search keywords should not silently fall back to local rules on LLM failure");
}

const generateRulesSource = extractFunction("generateRulesFromPanelKeywords");
assertIncludes(generateRulesSource, "generateRulesWithAi", "generate rules should call the LLM");
assertIncludes(generateRulesSource, "generate_rules_blocked_missing_ai_key", "generate rules should block without API key");
assertIncludes(generateRulesSource, "alertMissingAiKey", "generate rules should show a missing-key popup");
if (generateRulesSource.includes("ruleWordsFromKeywords(")) {
  failures.push("generate rules should not fall back to local ruleWordsFromKeywords()");
}
if (generateRulesSource.includes("已改用本地规则")) {
  failures.push("generate rules should not silently fall back to local rules on LLM failure");
}

const missingKeyPopupSource = extractFunction("alertMissingAiKey");
assertIncludes(missingKeyPopupSource, "高级规则", "missing-key popup should mention Advanced Rules");
assertIncludes(missingKeyPopupSource, "第三方大模型key", "missing-key popup should mention third-party model key");
assertIncludes(missingKeyPopupSource, "baf-missing-key-modal", "missing-key popup should render an in-panel strong modal");
if (missingKeyPopupSource.includes("window.alert")) {
  failures.push("missing-key popup should not use the browser native alert");
}

const panelSource = extractFunction("createPanel");
assertIncludes(panelSource, "ensureAiKeyBeforeAction", "button handlers should guard missing key before action");
assertIncludes(panelSource, "生成搜索词", "generate keywords button should guard missing key");
assertIncludes(panelSource, "启动或继续扫描", "start button should guard missing key");
assertIncludes(panelSource, "生成加分词/排除词", "generate rules button should guard missing key");
assertIncludes(panelSource, "baf-save-key", "panel should expose a dedicated save key button");
assertIncludes(panelSource, "baf-clear-ai-key", "panel should expose a clear API key button");
assertIncludes(panelSource, "clearAiKeySettings", "clear API key button should remove saved key settings");
assertIncludes(panelSource, "baf-clear-runtime-log", "panel should expose a clear runtime log button");
assertIncludes(panelSource, "clearRuntimeLogs", "clear runtime log button should clear saved logs");
assertIncludes(panelSource, "baf-ai-key-state", "panel should show a visible key save state");
assertIncludes(panelSource, "keydown", "panel should save the key on Enter");
assertIncludes(panelSource, "baf-run-state", "panel header should include a run-state indicator");
assertIncludes(panelSource, "baf-run-dot", "run-state indicator should include a colored dot");
assertIncludes(panelSource, "baf-run-text", "run-state indicator should include responsive text");
assertIncludes(panelSource, "baf-state-running", "run-state indicator should style running state");
assertIncludes(panelSource, "baf-state-complete", "run-state indicator should style complete state");
assertIncludes(panelSource, "baf-state-error", "run-state indicator should style error state");
assertIncludes(panelSource, "baf-version-current", "panel should show the current extension version");
assertIncludes(panelSource, "baf-version-latest", "panel should show the latest GitHub version");
assertIncludes(panelSource, "baf-version-checked-at", "panel should show the update check time");
assertIncludes(panelSource, "baf-check-update", "panel should expose a manual update check button");
assertIncludes(panelSource, "baf-open-release", "panel should expose a one-click releases button");
assertIncludes(panelSource, "v2.0.9", "panel should display the bumped extension version");
assertIncludes(panelSource, "baf-about-box", "advanced rules should include an about box");
assertIncludes(panelSource, "https://api.toporeduce.cn", "about box should link to TopoReduce");
assertIncludes(panelSource, "招聘与技术交流 QQ 群", "about box should include a QQ group entry");
assertIncludes(panelSource, "qm.qq.com/cgi-bin/qm/qr", "about box should use the requested QQ group URL");

const saveAiSettingsSource = extractFunction("saveAiSettings");
assertIncludes(saveAiSettingsSource, "storageLocalSet", "saveAiSettings should persist to extension storage");
assertIncludes(saveAiSettingsSource, "return false", "saveAiSettings should report failed persistence");
assertIncludes(saveAiSettingsSource, "return true", "saveAiSettings should report successful persistence");
assertIncludes(source, "function clearAiKeySettings", "code should provide API key clearing");
assertIncludes(source, "function clearRuntimeLogs", "code should provide runtime log clearing");
assertIncludes(source, "function maskApiKey", "code should provide a masked API key display");
assertIncludes(source, "isMaskedApiKey", "code should distinguish masked display from a real typed key");
assertIncludes(source, "isValidApiKeyForHeader", "code should reject API keys that cannot be used in headers");
assertIncludes(saveAiSettingsSource, "maskApiKey(nextApiKey)", "saveAiSettings should display the saved key in masked form");
assertIncludes(saveAiSettingsSource, "isValidApiKeyForHeader", "saveAiSettings should validate API key before storing it");
const updateAiKeyStateSource = extractFunction("updateAiKeyState");
assertIncludes(updateAiKeyStateSource, "!isMaskedApiKey", "masked key display should not be treated as a pending typed key");
const readPanelConfigSource = extractFunction("readPanelConfig");
assertIncludes(source, "function readThresholdInput", "threshold input should allow temporary blank editing");
assertIncludes(readPanelConfigSource, "readThresholdInput()", "readPanelConfig should use the threshold input helper");
assertIncludes(source, "function normalizeThresholdInput", "threshold input should normalize only after editing is committed");

assertIncludes(source, "function runStateInfo", "code should compute run-state indicator state");
assertIncludes(source, "updateRunStateIndicator", "code should update run-state indicator");
const resolveJobNatureSource = extractFunction("resolveJobNature");
assertIncludes(resolveJobNatureSource, "\\bai\\b", "AI job nature input should be treated as a technical role hint");
if (resolveJobNatureSource.indexOf("/销售|bd|商务|大客户|客户经理|客户代表|ka|渠道|拓展/") > resolveJobNatureSource.indexOf("/技术|工程师|开发|研发|算法|前端|后端|测试|运维|架构|java|python|\\bai\\b/")) {
  failures.push("sales-oriented job nature matching should take priority over the broad tech fallback");
}
const normalizeLlmJudgementSource = extractFunction("normalizeLlmJudgement");
assertIncludes(normalizeLlmJudgementSource, "safeNumber(parsed?.score", "LLM judgement normalization should use the model score directly");
if (source.includes("function reconcileLowLlmScore")) {
  failures.push("LLM scores should not be reconciled or clamped by local matching rules");
}
const jobJudgementPromptPayloadSource = extractFunction("jobJudgementPromptPayload");
assertIncludes(jobJudgementPromptPayloadSource, "1-100 integer", "LLM score schema should require a 1-100 score");
const judgeJobWithLlmSource = extractFunction("judgeJobWithLlm");
assertIncludes(judgeJobWithLlmSource, "1-100", "LLM prompt should ask for free 1-100 scoring");
assertIncludes(judgeJobWithLlmSource, "不要只给 55、60、70", "LLM prompt should avoid coarse threshold-only scores");

assertIncludes(backgroundSource, "function extractResponseContent", "background should normalize LLM response content");
assertIncludes(manifestSource, "\"version\": \"2.0.9\"", "manifest version should be bumped for each released change");
assertIncludes(manifestSource, "https://api.github.com/*", "manifest should allow GitHub API requests for update checks");
assertIncludes(manifestSource, "https://raw.githubusercontent.com/*", "manifest should allow raw manifest fallback requests");
assertIncludes(source, "event.stopPropagation();", "version buttons should not trigger panel drag handlers");
assertIncludes(source, "button.textContent = \"检测中\"", "update check button should show visible progress");
assertIncludes(source, "后台版本检测超时", "update check should time out if the background never responds");
assertIncludes(backgroundSource, "function fetchWithTimeout", "background should wrap GitHub fetches with a timeout");
assertIncludes(backgroundSource, "AbortController", "background fetch timeout should abort hanging GitHub requests");
assertIncludes(backgroundSource, "请求超时", "background should report GitHub timeout clearly");
assertIncludes(backgroundSource, "boss-check-update", "background should handle GitHub version checks");
assertIncludes(backgroundSource, "api.github.com/repos/DamonZS/BOSS-Auto-Job-Extension/releases/latest", "background should query GitHub latest release");
assertIncludes(backgroundSource, "raw.githubusercontent.com/DamonZS/BOSS-Auto-Job-Extension/main/manifest.json", "background should fall back to main branch manifest when releases are unavailable");
assertIncludes(backgroundSource, "archive/refs/heads/main.zip", "background should offer a main branch zip fallback download");
assertIncludes(backgroundSource, "function checkGithubReleaseUpdate", "background should isolate GitHub release update checks");
assertIncludes(backgroundSource, "function checkMainManifestUpdate", "background should isolate main manifest fallback checks");
assertIncludes(backgroundSource, "source: \"main\"", "background should report fallback update source");
assertIncludes(backgroundSource, "compareVersions", "background should compare semantic versions");
assertIncludes(backgroundSource, "releaseUrl", "background should return a releases download URL");
assertIncludes(backgroundSource, "choices?.[0]?.text", "background should support text completions response shape");
assertIncludes(backgroundSource, "output_text", "background should support output_text response shape");
assertIncludes(backgroundSource, "extractResponseContent(data)", "background should use normalized response extraction");
assertIncludes(backgroundSource, "safeJsonParse", "background should parse response text without discarding diagnostics");
assertIncludes(backgroundSource, "rawText", "background should preserve raw response text for diagnostics");
assertIncludes(backgroundSource, "responseSnippet", "background should include response snippets for empty responses");
assertIncludes(backgroundSource, "isValidHeaderValue", "background should validate Authorization header value before fetch");
assertIncludes(backgroundSource, "isHtmlResponse", "background should reject HTML gateway responses");
assertIncludes(backgroundSource, "/v1/chat/completions", "background should use the OpenAI-compatible chat completions path");
assertIncludes(source, "function repairJsonText", "code should try to repair near-JSON AI responses");
assertIncludes(source, "function extractJsonBlock", "code should extract JSON blocks from AI output");
assertIncludes(source, "parseAiJson", "code should parse AI JSON through the tolerant helper");
assertIncludes(source, "function firstAiArrayField", "code should accept alternate AI array field names");
assertIncludes(source, "function extractAiKeywordCandidates", "search keyword generation should use a dedicated tolerant extractor");
assertIncludes(source, "function sanitizeSearchKeywords", "search keyword generation should use a dedicated precise-title sanitizer");
assertIncludes(source, "replace(/^[\\s\"'`[{(]+/, \"\")", "search keyword sanitizer should strip leading JSON wrappers");
assertIncludes(source, "filter(word => !/^[{}\\[\\]()]+$/.test(word))", "search keyword sanitizer should drop bare JSON punctuation");
assertIncludes(source, "function buildSearchKeywordMessages", "search keyword generation should use a dedicated strict prompt builder");
const aiProfilePayloadSource = extractFunction("aiProfilePayload");
assertIncludes(aiProfilePayloadSource, "mode !== \"search_keywords\"", "search keyword payload should drop prior keyword and preference context");
assertIncludes(aiProfilePayloadSource, "useLiveConfigSummary", "AI payload should support bypassing stale AI summaries");
const generateSearchKeywordsWithAiSource = extractFunction("generateSearchKeywordsWithAi");
assertIncludes(generateSearchKeywordsWithAiSource, "readPanelConfig();", "search keyword generation should sync panel state before building the payload");
assertIncludes(generateSearchKeywordsWithAiSource, "aiProfilePayload({ mode: \"search_keywords\", useLiveConfigSummary: true })", "search keyword generation should use the clean payload mode");
assertIncludes(generateSearchKeywordsWithAiSource, "const messages = buildSearchKeywordMessages(payload)", "search keyword generation should build messages from the strict helper");
const generateRulesWithAiSource = extractFunction("generateRulesWithAi");
assertIncludes(generateRulesWithAiSource, "readPanelConfig();", "rule generation should sync panel state before building the payload");
assertIncludes(generateRulesWithAiSource, "aiProfilePayload({ useLiveConfigSummary: true })", "rule generation should use a live local config summary");
assertIncludes(source, "normalizedNature 和 targetDirections", "search keyword prompt should strongly bind output to job nature and target directions");

const readmeSource = fs.readFileSync("README.md", "utf8");
assertIncludes(readmeSource, "版本更新", "README should document version updates");
assertIncludes(readmeSource, "GitHub Releases", "README should mention GitHub Releases update flow");
assertIncludes(readmeSource, "GitHub Actions", "README should document the automated release workflow");
assertIncludes(readmeSource, "git push origin v", "README should explain tag push release publishing");
assertIncludes(readmeSource, "main.zip", "README should document the fallback zip download");
assertIncludes(readmeSource, "chrome://extensions/", "README should include manual extension reload steps");
assertIncludes(releaseWorkflowSource, "on:", "release workflow should exist");
assertIncludes(releaseWorkflowSource, "branches:", "release workflow should run on main branch pushes for build artifacts");
assertIncludes(releaseWorkflowSource, "- main", "release workflow should include the main branch");
assertIncludes(releaseWorkflowSource, "v*.*.*", "release workflow should run on version tags");
assertIncludes(releaseWorkflowSource, "workflow_dispatch", "release workflow should support manual runs");
assertIncludes(releaseWorkflowSource, "should_release", "release workflow should separate artifacts from formal releases");
assertIncludes(releaseWorkflowSource, "node --check background.js", "release workflow should validate background.js");
assertIncludes(releaseWorkflowSource, "node --check content.js", "release workflow should validate content.js");
assertIncludes(releaseWorkflowSource, "node scripts/regression-checks.js", "release workflow should run regression checks");
assertIncludes(releaseWorkflowSource, "softprops/action-gh-release", "release workflow should create GitHub Releases");
assertIncludes(releaseWorkflowSource, "if: steps.meta.outputs.should_release == 'true'", "release workflow should only create releases for tags or tagged manual runs");
assertIncludes(releaseWorkflowSource, "BOSS-Auto-Job-Extension-v${VERSION}.zip", "release workflow should package versioned zip");
assertIncludes(source, "如果当前 input 里没有某个岗位性质或目标方向，就不要擅自生成该方向的岗位名称", "search keyword prompt should forbid inventing unselected directions");
assertIncludes(source, "不要输出 analysis 字段", "search keyword prompt should forbid exposing reasoning fields");
assertIncludes(source, "const fromObject = sanitizeSearchKeywords(findAiArrayField(parsed, fieldNames), 30);", "search keyword generation should recursively read nested keyword arrays");
assertIncludes(source, "parseMaybeJsonText", "search keyword generation should parse stringified JSON payloads");
assertIncludes(source, "extractKeywordLines", "search keyword generation should accept line-based keyword responses");
assertIncludes(source, "search_terms", "search keyword generation should accept search_terms fallback");
assertIncludes(source, "job_titles", "search keyword generation should accept job_titles fallback");
assertIncludes(source, "include_keywords", "rules generation should accept include_keywords fallback");
assertIncludes(source, "exclude_keywords", "rules generation should accept exclude_keywords fallback");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("regression checks passed");
