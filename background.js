function extractResponseContent(data) {
  const direct = data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || data?.output_text
    || data?.content
    || data?.message?.content;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const outputParts = Array.isArray(data?.output) ? data.output : [];
  const outputText = outputParts
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .map(part => part?.text || part?.content || "")
    .filter(Boolean)
    .join("\n")
    .trim();
  return outputText;
}

function safeJsonParse(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (_) {
    return null;
  }
}

function responseSnippet(rawText) {
  return String(rawText || "").replace(/\s+/g, " ").trim().slice(0, 240) || "empty body";
}

function isHtmlResponse(rawText) {
  return /^\s*<!doctype\s+html/i.test(String(rawText || "")) || /^\s*<html[\s>]/i.test(String(rawText || ""));
}

function isValidHeaderValue(value) {
  return /^[\x21-\x7e]+$/.test(String(value || "")) && !/\s/.test(String(value || ""));
}

function responseShape(data) {
  if (!data || typeof data !== "object") return data === null ? "null" : typeof data;
  return Object.keys(data).slice(0, 8).join(", ") || "empty object";
}

function logDeepSeekEvent(event, data = {}) {
  try {
    console.log("[BOSS-Auto-Job][DeepSeek]", event, JSON.stringify(data));
  } catch (_) {
    console.log("[BOSS-Auto-Job][DeepSeek]", event, data);
  }
}

const GITHUB_LATEST_RELEASE_API = "https://api.github.com/repos/DamonZS/BOSS-Auto-Job-Extension/releases/latest";
const GITHUB_RELEASES_URL = "https://github.com/DamonZS/BOSS-Auto-Job-Extension/releases";
const GITHUB_MAIN_MANIFEST_URL = "https://raw.githubusercontent.com/DamonZS/BOSS-Auto-Job-Extension/main/manifest.json";
const GITHUB_MAIN_ZIP_URL = "https://github.com/DamonZS/BOSS-Auto-Job-Extension/archive/refs/heads/main.zip";
const GITHUB_FETCH_TIMEOUT_MS = 8000;

function compareVersions(left, right) {
  const leftParts = String(left || "").replace(/^v/i, "").split(/[.-]/).map(part => Number(part) || 0);
  const rightParts = String(right || "").replace(/^v/i, "").split(/[.-]/).map(part => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

async function checkGithubUpdate(currentVersion) {
  let releaseError = "";
  try {
    return await checkGithubReleaseUpdate(currentVersion);
  } catch (error) {
    releaseError = String(error?.message || error);
  }

  try {
    const result = await checkMainManifestUpdate(currentVersion);
    return {
      ...result,
      releaseError
    };
  } catch (error) {
    const mainError = String(error?.message || error);
    throw new Error(`GitHub Releases 检测失败：${releaseError || "未知错误"}；main 分支检测失败：${mainError}`);
  }
}

async function checkGithubReleaseUpdate(currentVersion) {
  const response = await fetchWithTimeout(GITHUB_LATEST_RELEASE_API, {
    headers: {
      "Accept": "application/vnd.github+json"
    }
  }, GITHUB_FETCH_TIMEOUT_MS);
  const rawText = await response.text();
  const data = safeJsonParse(rawText);
  if (!response.ok) {
    throw new Error(data?.message || `GitHub HTTP ${response.status}: ${responseSnippet(rawText)}`);
  }
  const latestVersion = String(data?.tag_name || data?.name || "").replace(/^v/i, "").trim();
  if (!latestVersion) throw new Error("GitHub Releases 未返回版本号");
  const releaseUrl = String(data?.html_url || GITHUB_RELEASES_URL);
  return {
    currentVersion: String(currentVersion || ""),
    latestVersion,
    checkedAt: new Date().toISOString(),
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl,
    source: "release"
  };
}

async function checkMainManifestUpdate(currentVersion) {
  const response = await fetchWithTimeout(GITHUB_MAIN_MANIFEST_URL, {
    cache: "no-store"
  }, GITHUB_FETCH_TIMEOUT_MS);
  const rawText = await response.text();
  const data = safeJsonParse(rawText);
  if (!response.ok) {
    throw new Error(data?.message || `GitHub main HTTP ${response.status}: ${responseSnippet(rawText)}`);
  }
  const latestVersion = String(data?.version || "").replace(/^v/i, "").trim();
  if (!latestVersion) throw new Error("main 分支 manifest.json 未返回版本号");
  return {
    currentVersion: String(currentVersion || ""),
    latestVersion,
    checkedAt: new Date().toISOString(),
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl: GITHUB_MAIN_ZIP_URL,
    source: "main"
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`请求超时：${Math.round(timeoutMs / 1000)} 秒内 GitHub 未响应`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "boss-check-update") {
    (async () => {
      try {
        const result = await checkGithubUpdate(message.currentVersion);
        sendResponse({ ok: true, ...result });
      } catch (error) {
        sendResponse({
          ok: false,
          error: String(error?.message || error),
          releaseUrl: GITHUB_RELEASES_URL,
          checkedAt: new Date().toISOString()
        });
      }
    })();
    return true;
  }

  if (!message || message.type !== "deepseek-chat") return false;

  (async () => {
    try {
      const stored = await chrome.storage.local.get(["bossAiAutoFavAiSettingsV2"]);
      const apiKey = String(stored?.bossAiAutoFavAiSettingsV2?.apiKey || "").trim();
      const model = String(message.model || stored?.bossAiAutoFavAiSettingsV2?.model || "deepseek-v4-flash").trim() || "deepseek-v4-flash";
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      logDeepSeekEvent("request_start", {
        requestId,
        model,
        maxTokens: message.maxTokens || 1400,
        messageCount: Array.isArray(message.messages) ? message.messages.length : 0
      });
      if (!apiKey) throw new Error("缺少 API Key");
      if (!isValidHeaderValue(apiKey)) {
        throw new Error("API Key 含有中文、空格或不可见字符，请在高级规则中重新复制纯 Key 并保存");
      }

      const requestBody = {
        model,
        messages: message.messages || [],
        temperature: 0.2,
        max_tokens: message.maxTokens || 1400
      };
      logDeepSeekEvent("request_body", {
        requestId,
        model,
        bodyPreview: responseSnippet(JSON.stringify(requestBody))
      });

      const response = await fetch("https://api.toporeduce.cn/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      logDeepSeekEvent("response_meta", {
        requestId,
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get("content-type") || ""
      });

      const rawText = await response.text();
      const data = safeJsonParse(rawText);
      logDeepSeekEvent("response_raw", {
        requestId,
        rawPreview: responseSnippet(rawText),
        parsedType: data ? typeof data : "null",
        parsedKeys: data && typeof data === "object" ? Object.keys(data).slice(0, 8) : []
      });
      if (isHtmlResponse(rawText)) {
        logDeepSeekEvent("response_html", { requestId, htmlPreview: responseSnippet(rawText) });
        throw new Error(`接口返回了网页 HTML，不是大模型 JSON。请检查 API 地址是否支持 /v1/chat/completions，响应片段：${responseSnippet(rawText)}`);
      }
      if (!response.ok) {
        const detail = data?.error?.message || data?.message || `HTTP ${response.status}: ${responseSnippet(rawText)}`;
        logDeepSeekEvent("response_error", { requestId, detail });
        throw new Error(detail);
      }

      const content = extractResponseContent(data) || (!data && rawText.trim().startsWith("{") ? "" : rawText.trim());
      if (!content) {
        logDeepSeekEvent("response_empty", {
          requestId,
          responseShape: responseShape(data),
          responseSnippet: responseSnippet(rawText)
        });
        throw new Error(`接口返回为空，返回字段：${responseShape(data)}，响应片段：${responseSnippet(rawText)}`);
      }
      logDeepSeekEvent("response_ok", {
        requestId,
        contentPreview: responseSnippet(content)
      });
      sendResponse({ ok: true, content, usage: data?.usage || null });
    } catch (error) {
      logDeepSeekEvent("request_failed", { error: String(error?.message || error) });
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});
