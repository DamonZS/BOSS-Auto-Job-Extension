chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "deepseek-chat") return false;

  (async () => {
    try {
      const stored = await chrome.storage.local.get(["bossAiAutoFavAiSettingsV2"]);
      const apiKey = String(stored?.bossAiAutoFavAiSettingsV2?.apiKey || "").trim();
      if (!apiKey) throw new Error("缺少 API Key");

      const response = await fetch("https://api.toporeduce.cn/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: String(message.model || stored?.bossAiAutoFavAiSettingsV2?.model || "deepseek-v4-flash").trim() || "deepseek-v4-flash",
          messages: message.messages || [],
          temperature: 0.2,
          max_tokens: message.maxTokens || 1400,
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
        throw new Error(detail);
      }

      const content = data?.choices?.[0]?.message?.content || "";
      if (!content) throw new Error("接口返回为空");
      sendResponse({ ok: true, content, usage: data?.usage || null });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});
