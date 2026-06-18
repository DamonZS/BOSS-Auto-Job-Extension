(function () {
  if (window.__bossAiAutoFavLoaded) return;
  window.__bossAiAutoFavLoaded = true;

  const DEFAULT_TARGET_KEYWORDS = [];
  const DEFAULT_PER_KEYWORD_MAX = 100;
  const RULE_VERSION = "rough-screen-v13";
  const REVIEW_THRESHOLD = 50;
  const RULE_SEED_LIMIT = 5;
  const MAX_EMPTY_SCROLL_ATTEMPTS = 5;
  const MAX_DUPLICATE_SCROLL_ATTEMPTS = 80;
  const MAX_CONSECUTIVE_ERRORS = 5;
  const KEYWORD_SWITCH_MIN_SEC = 3;
  const KEYWORD_SWITCH_MAX_SEC = 6;
  const SEARCH_PAGE_LOAD_WAIT_MS = 2500;

  const config = {
    threshold: 60,
    maxJobs: 300,
    delayMin: 1800,
    delayMax: 3600,
    positive: {
      high: [],
      medium: [],
      low: []
    },
    negative: {
      hard: [
        "保险", "贷款", "互联网金融", "计算机相关专业必需", "纯地推",
        "会销", "招商", "自带资源", "自带行业", "加盟", "金融线",
        "美业", "日结", "资源变现", "漫剧", "AI漫剧", "短剧",
        "GEO", "Geo", "geo优化", "AI精准引流", "金融销售",
        "管培生", "实习生", "储备干部", "招生", "提分",
        "To C", "个人（To C）", "C端销售", "对接c端",
        "社交网络与媒体", "文化传媒", "网络传媒", "AI双红利",
        "双红利赛道", "自带客户", "单休", "大小周", "周日单休"
      ],
      soft: [
        "网站建设", "小程序", "网络推广", "外包", "定制开发",
        "课程", "培训类产品", "招商",
        "销冠", "月入", "精准客资", "精准客源", "薪资无上限",
        "接受应届生", "高中", "圈层", "KOL", "媒体", "渠道资源"
      ]
    },
    filters: {
      salaryMin: "",
      salaryMax: "",
      customPositive: [],
      customNegative: [],
      skipRecorded: true,
      jobNature: "",
      targetKeywords: []
    },
    safety: {
      dailyScanLimit: 500,
      dailyFavoriteLimit: 80,
      pauseEvery: 25,
      pauseMinSec: 180,
      pauseMaxSec: 360
    },
    ai: {
      provider: "deepseek",
      apiKey: "",
      model: "deepseek-v4-flash"
    },
    localAi: {
      queryInfo: true
    },
    greeting: {
      enabled: false,
      minScore: 60,
      dailyLimit: 20,
      template: "你好，我对这个岗位比较感兴趣，方便进一步沟通吗？"
    }
  };

  const STORAGE_KEY = "bossAiAutoFavRecordsV1";
  const PANEL_POS_KEY = "bossAiAutoFavPanelPosV1";
  const PANEL_COLLAPSED_KEY = "bossAiAutoFavPanelCollapsedV1";
  const CAMPAIGN_KEY = "bossAiAutoFavCampaignV4";
  const DAILY_KEY = "bossAiAutoFavDailyStatsV1";
  const SETTINGS_KEY = "bossAiAutoFavSettingsV4";
  const USER_PREF_KEY = "bossAiAutoFavUserPrefsV1";
  const AI_SETTINGS_KEY = "bossAiAutoFavAiSettingsV1";
  const AI_STORAGE_KEY = "bossAiAutoFavAiSettingsV2";
  const AI_STRATEGY_KEY = "bossAiAutoFavAiStrategyV1";
  const DEBUG_LOG_KEY = "bossAiAutoFavDebugLogsV1";
  const GREETED_HREFS_KEY = "bossAiAutoFavGreetedHrefsV1";
  const CAMPAIGN_SCHEMA_VERSION = 5;
  const SETTINGS_VERSION = 8;
  const SCALE_OPTIONS = [
    { code: "301", label: "0-20人" },
    { code: "302", label: "20-99人" },
    { code: "303", label: "100-499人" },
    { code: "304", label: "500-999人" },
    { code: "305", label: "1000-9999人" },
    { code: "306", label: "10000人以上" }
  ];
  const state = {
    running: false,
    processedThisRun: new Set(),
    historicalSeen: new Set(),
    logs: [],
    records: loadRecords(),
    scanned: 0,
    favorited: 0,
    reviewed: 0,
    skipped: 0,
    errors: 0,
    campaign: loadCampaign(),
    daily: loadDailyStats(),
    settings: loadSettings(),
    userPrefs: loadUserPrefs(),
    aiSettings: loadAiSettings(),
    aiStrategy: loadAiStrategy(),
    debugLogs: loadDebugLogs(),
    greetedHrefs: loadGreetedHrefs(),
    settingsTimer: null,
    autoTimer: null,
    countdownTimer: null,
    pausedByUserThisSession: false,
    logFilter: "all"
  };

  function loadRecords() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records.slice(-1200)));
  }

  function loadDebugLogs() {
    try {
      return JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveDebugLogs() {
    localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(state.debugLogs.slice(-400)));
  }

  function clearRuntimeLogs() {
    state.debugLogs = [];
    localStorage.removeItem(DEBUG_LOG_KEY);
    updateRuntimeLogPreview(null);
  }

  function loadGreetedHrefs() {
    try {
      return new Set(JSON.parse(localStorage.getItem(GREETED_HREFS_KEY) || "[]"));
    } catch (_) {
      return new Set();
    }
  }

  function saveGreetedHrefs() {
    localStorage.setItem(GREETED_HREFS_KEY, JSON.stringify([...state.greetedHrefs].slice(-1500)));
  }

  function loadCampaign() {
    try {
      return JSON.parse(localStorage.getItem(CAMPAIGN_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (!saved) return null;
      if (saved.version !== SETTINGS_VERSION) {
        const previousVersion = Number(saved.version || 0);
        if (Number(saved.threshold) === 75) saved.threshold = 60;
        if (Number(saved.maxJobs) === 80) saved.maxJobs = 500;
        if (Number(saved.safety?.dailyScanLimit) === 300) saved.safety.dailyScanLimit = 1000;
        if (previousVersion < 7 && saved.filters) {
          saved.filters.customPositive = [];
          saved.filters.customNegative = [];
        }
        saved.version = SETTINGS_VERSION;
        saveSettings(saved);
      }
      return saved;
    } catch (_) {
      return null;
    }
  }

  function loadUserPrefs() {
    try {
      return JSON.parse(localStorage.getItem(USER_PREF_KEY) || "null") || {
        likedWords: [],
        dislikedWords: [],
        feedbackHistory: []
      };
    } catch (_) {
      return { likedWords: [], dislikedWords: [], feedbackHistory: [] };
    }
  }

  function saveUserPrefs() {
    state.userPrefs = {
      likedWords: [...new Set(state.userPrefs.likedWords || [])],
      dislikedWords: [...new Set(state.userPrefs.dislikedWords || [])],
      feedbackHistory: (state.userPrefs.feedbackHistory || []).slice(-80)
    };
    localStorage.setItem(USER_PREF_KEY, JSON.stringify(state.userPrefs));
  }

  function loadAiSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || "null") || {};
      return {
        provider: "deepseek",
        apiKey: "",
        hasKey: Boolean(saved.apiKey),
        model: saved.model || "deepseek-v4-flash"
      };
    } catch (_) {
      return { provider: "deepseek", apiKey: "", hasKey: false, model: "deepseek-v4-flash" };
    }
  }

  function storageLocalGet(keys) {
    return new Promise(resolve => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve({});
        return;
      }
      chrome.storage.local.get(keys, result => {
        if (chrome.runtime?.lastError) {
          resolve({});
          return;
        }
        resolve(result || {});
      });
    });
  }

  function storageLocalSet(values) {
    return new Promise(resolve => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve(false);
        return;
      }
      chrome.storage.local.set(values, () => {
        resolve(!chrome.runtime?.lastError);
      });
    });
  }

  function storageLocalRemove(keys) {
    return new Promise(resolve => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve(false);
        return;
      }
      chrome.storage.local.remove(keys, () => {
        resolve(!chrome.runtime?.lastError);
      });
    });
  }

  function maskApiKey(apiKey) {
    const key = String(apiKey || "").trim();
    if (!key) return "";
    const headLength = Math.min(6, Math.max(3, Math.floor(key.length / 4)));
    const tailLength = Math.min(6, Math.max(4, Math.floor(key.length / 5)));
    if (key.length <= headLength + tailLength + 4) {
      return `${key.slice(0, 2)}****${key.slice(-2)}`;
    }
    return `${key.slice(0, headLength)}${"*".repeat(Math.min(12, Math.max(6, key.length - headLength - tailLength)))}${key.slice(-tailLength)}`;
  }

  function isMaskedApiKey(value) {
    return /\*{3,}/.test(String(value || ""));
  }

  function isValidApiKeyForHeader(value) {
    const key = String(value || "").trim();
    return Boolean(key && /^[\x21-\x7e]+$/.test(key) && !/\s/.test(key));
  }

  async function hydrateAiSettingsFromExtensionStorage() {
    const stored = await storageLocalGet([AI_STORAGE_KEY]);
    const next = stored?.[AI_STORAGE_KEY] || {};
    let migrated = false;
    try {
      const legacy = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || "null") || {};
      if (legacy.apiKey && !next.apiKey) {
        next.apiKey = legacy.apiKey;
        migrated = true;
      }
      if (legacy.model && !next.model) next.model = legacy.model;
    } catch (_) {}
    state.aiSettings = {
      provider: "deepseek",
      apiKey: "",
      hasKey: Boolean(String(next.apiKey || "").trim()),
      model: String(next.model || state.aiSettings.model || "deepseek-v4-flash").trim() || "deepseek-v4-flash"
    };
    if (migrated) {
      await storageLocalSet({
        [AI_STORAGE_KEY]: {
          provider: "deepseek",
          apiKey: String(next.apiKey || "").trim(),
          model: state.aiSettings.model
        }
      });
      localStorage.removeItem(AI_SETTINGS_KEY);
      debugLog("ai_key_migrated_to_extension_storage");
    }
    const keyInput = document.querySelector("#baf-ai-key");
    if (keyInput) {
      const savedKey = String(next.apiKey || "").trim();
      keyInput.value = savedKey ? maskApiKey(savedKey) : "";
      keyInput.dataset.maskedKey = savedKey ? "1" : "";
      keyInput.placeholder = state.aiSettings.hasKey ? "已保存，可直接替换" : "sk-...";
    }
    setPanelValue("#baf-ai-model", state.aiSettings.model || "deepseek-v4-flash");
    updateAiKeyState();
    updatePanel();
  }

  async function saveAiSettings() {
    const currentStored = await storageLocalGet([AI_STORAGE_KEY]);
    const existing = currentStored?.[AI_STORAGE_KEY] || {};
    const pendingApiKey = isMaskedApiKey(state.aiSettings.apiKey) ? "" : String(state.aiSettings.apiKey || "").trim();
    if (pendingApiKey && !isValidApiKeyForHeader(pendingApiKey)) return false;
    const nextApiKey = String(pendingApiKey || existing.apiKey || "").trim();
    const nextModel = String(state.aiSettings.model || existing.model || "deepseek-v4-flash").trim() || "deepseek-v4-flash";
    const saved = await storageLocalSet({
      [AI_STORAGE_KEY]: {
        provider: "deepseek",
        apiKey: nextApiKey,
        model: nextModel
      }
    });
    if (!saved) return false;
    state.aiSettings = {
      provider: "deepseek",
      apiKey: "",
      hasKey: Boolean(nextApiKey),
      model: nextModel
    };
    localStorage.removeItem(AI_SETTINGS_KEY);
    const keyInput = document.querySelector("#baf-ai-key");
    if (keyInput && pendingApiKey && keyInput.value) {
      keyInput.value = maskApiKey(nextApiKey);
      keyInput.dataset.maskedKey = nextApiKey ? "1" : "";
      keyInput.placeholder = state.aiSettings.hasKey ? "已保存，可直接替换" : "sk-...";
    }
    updateAiKeyState();
    return true;
  }

  async function clearAiKeySettings() {
    const removed = await storageLocalRemove([AI_STORAGE_KEY]);
    localStorage.removeItem(AI_SETTINGS_KEY);
    state.aiSettings = {
      provider: "deepseek",
      apiKey: "",
      hasKey: false,
      model: state.aiSettings.model || "deepseek-v4-flash"
    };
    const keyInput = document.querySelector("#baf-ai-key");
    if (keyInput) {
      keyInput.value = "";
      keyInput.dataset.maskedKey = "";
      keyInput.placeholder = "sk-...";
    }
    updateAiKeyState("已清除");
    return removed;
  }

  function loadAiStrategy() {
    try {
      return JSON.parse(localStorage.getItem(AI_STRATEGY_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function saveAiStrategy() {
    if (!state.aiStrategy) {
      localStorage.removeItem(AI_STRATEGY_KEY);
      return;
    }
    localStorage.setItem(AI_STRATEGY_KEY, JSON.stringify(state.aiStrategy));
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function loadDailyStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(DAILY_KEY) || "null");
      if (saved?.date === todayKey()) {
        return {
          date: saved.date,
          scanned: Number(saved.scanned || 0),
          favorited: Number(saved.favorited || 0),
          greeted: Number(saved.greeted || 0)
        };
      }
    } catch (_) {}
    return { date: todayKey(), scanned: 0, favorited: 0, greeted: 0 };
  }

  function saveDailyStats() {
    if (state.daily.date !== todayKey()) {
      state.daily = { date: todayKey(), scanned: 0, favorited: 0, greeted: 0 };
    }
    state.daily.greeted = Number(state.daily.greeted || 0);
    localStorage.setItem(DAILY_KEY, JSON.stringify(state.daily));
  }

  function saveCampaign() {
    if (!state.campaign) {
      localStorage.removeItem(CAMPAIGN_KEY);
      return;
    }
    localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(state.campaign));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function jitter() {
    return config.delayMin + Math.random() * (config.delayMax - config.delayMin);
  }

  function randomBetweenSec(min, max) {
    const safeMin = Math.max(0, Number(min || 0));
    const safeMax = Math.max(safeMin, Number(max || safeMin));
    return Math.round(safeMin + Math.random() * (safeMax - safeMin));
  }

  function norm(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function escapeAttr(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function parseKeywordList(text) {
    return [...new Set((text || "")
      .split(/[\n,，、;；]+/)
      .map(s => norm(s))
      .filter(Boolean))];
  }

  function keywordLabel(keyword) {
    return keyword ? keyword : "推荐流";
  }

  function isBroadTargetKeyword(word) {
    const lower = norm(word).toLowerCase();
    if (!lower) return true;
    const broadWords = [
      "ai", "人工智能", "智能", "软件", "互联网", "科技", "it",
      "saas", "crm", "erp", "oa", "tob", "to b", "b端",
      "销售", "运营", "客户成功", "售前", "产品", "技术", "岗位", "职位"
    ];
    return broadWords.includes(lower);
  }

  function targetDirectionIssue() {
    const rawTargets = (config.filters.targetKeywords || []).map(norm).filter(Boolean);
    if (!rawTargets.length) return "未填写目标方向";
    if (!rawTargets.some(word => !isBroadTargetKeyword(word))) return "目标方向太泛";
    return "";
  }

  function usefulTargetKeywords() {
    return (config.filters.targetKeywords || [])
      .map(norm)
      .filter(word => word && !isBroadTargetKeyword(word));
  }

  function conflictsWithTargetDirection(word) {
    const value = norm(word).toLowerCase();
    if (!value) return false;
    return usefulTargetKeywords().some(target => {
      const lowerTarget = target.toLowerCase();
      if (!lowerTarget || lowerTarget.length < 2) return false;
      if (!value.includes(lowerTarget)) return false;
      if (value.startsWith(`非${lowerTarget}`)) return false;
      if (value.startsWith(`不${lowerTarget}`)) return false;
      if (value.startsWith(`无${lowerTarget}`)) return false;
      if (value.startsWith(`无关${lowerTarget}`)) return false;
      if (value.includes(`非${lowerTarget}`)) return false;
      return true;
    });
  }

  function filterConflictingNegativeWords(words, options = {}) {
    return (words || []).filter(word => {
      if (!conflictsWithTargetDirection(word)) return true;
      return Boolean(options.keepManual);
    });
  }

  function expandSearchKeywords(keywords, options = {}) {
    const nature = options.nature || resolveJobNature(document.querySelector("#baf-job-nature")?.value || config.filters.jobNature || "");
    const expanded = [];
    const add = words => {
      for (const word of words) {
        const value = norm(word);
        if (value) expanded.push(value);
      }
    };
    for (const keyword of keywords) {
      add([keyword]);
      const lower = keyword.toLowerCase();
      if (/ai|人工智能|智能/.test(lower) && /销售|商务|bd|大客户|客户经理/.test(lower)) {
        add(["AI应用销售", "AI客服销售", "智能客服销售", "AI客户成功", "AI解决方案销售", "Agent销售", "Agent售前", "大模型销售"]);
      }
      if (/saas|软件/.test(lower) && /销售|商务|bd|大客户|客户经理/.test(lower)) {
        add(["SaaS销售", "软件销售", "企业服务销售", "解决方案销售"]);
      }
      if (nature !== "operations" && /客户成功|客户运营|续费|续签/.test(keyword)) {
        add(["AI客户成功", "SaaS客户成功", "客户运营", "续费续签", "交付顾问"]);
      }
      if (/售前|解决方案|方案/.test(keyword)) {
        add(["售前解决方案", "解决方案顾问", "AI售前", "SaaS售前", "实施顾问"]);
      }
      if (/agent|智能体/i.test(keyword)) {
        if (nature === "sales" || nature === "any") add(["Agent销售", "智能体销售", "AI Agent"]);
        if (nature === "presales") add(["Agent售前", "智能体解决方案", "AI Agent"]);
      }
    }
    return expanded;
  }

  function keywordProfileFromPanel() {
    const natureText = document.querySelector("#baf-job-nature")?.value || config.filters.jobNature || "";
    const targetText = document.querySelector("#baf-target-keywords")?.value || "";
    const targets = parseKeywordList(targetText);
    return {
      nature: resolveJobNature(natureText),
      natureText: jobNatureDisplayValue(natureText || config.filters.jobNature || ""),
      targets
    };
  }

  function searchKeywordsFromProfile() {
    const { nature, targets } = keywordProfileFromPanel();
    const words = [];
    const add = list => {
      for (const word of list) {
        const value = norm(word);
        if (value) words.push(value);
      }
    };
    const addByNature = target => {
      if (nature === "customer_success") {
        add([`${target}客户成功`, `${target}客户运营`, `${target}续费`, `${target}交付`, `${target}实施顾问`, `${target}客户经理`, `${target}服务顾问`, `${target}培训顾问`, `${target}复购`, `${target}扩容`]);
      } else if (nature === "presales") {
        add([`${target}售前`, `${target}解决方案`, `${target}方案顾问`, `${target}售前顾问`, `${target}产品顾问`, `${target}技术销售`, `${target}销售工程师`, `${target}项目售前`, `${target}POC`, `${target}需求顾问`]);
      } else if (nature === "operations") {
        add([`${target}运营`, `${target}客户运营`, `${target}商家运营`, `${target}用户运营`, `${target}增长运营`, `${target}渠道运营`, `${target}平台运营`, `${target}项目运营`, `${target}产品运营`, `${target}销售运营`]);
      } else if (nature === "product") {
        add([`${target}产品`, `${target}产品经理`, `${target}产品运营`, `${target}需求分析`, `${target}产品规划`, `${target}项目产品`, `${target}平台产品`, `${target}增长产品`]);
      } else if (nature === "tech") {
        add([`${target}工程师`, `${target}开发`, `${target}技术支持`, `${target}应用工程师`, `${target}解决方案工程师`, `${target}测试`, `${target}实施`, `${target}运维`, `${target}架构`, `${target}算法`]);
      } else {
        add([`${target}销售`, `${target}商务`, `${target}大客户销售`, `${target}客户经理`, `${target}销售经理`, `${target}销售顾问`, `${target}BD`, `${target}渠道销售`, `${target}解决方案销售`, `${target}销售工程师`, `${target}区域销售`, `${target}项目销售`]);
      }
    };

    for (const target of targets) {
      const lower = target.toLowerCase();
      if (nature === "sales" || nature === "any") {
        if (/ai应用|ai销售|人工智能/.test(lower)) add(["AI应用销售", "AI销售"]);
        if (/ai客服|智能客服|aicc|客服/.test(lower)) add(["AI客服销售", "智能客服销售", "AICC销售"]);
        if (/agent|智能体/i.test(target)) add(["Agent销售", "AI Agent销售", "智能体销售"]);
        if (/知识库/.test(target)) add(["AI知识库销售", "企业知识库销售"]);
        if (/销售助手/.test(target)) add(["AI销售助手", "AI销售助手销售"]);
        if (/大模型|maas/i.test(target)) add(["大模型销售", "MaaS销售"]);
        if (/ai产品|ai软件|ai平台/i.test(target)) add(["AI软件销售", "AI产品销售", "AI平台销售"]);
      }
      addByNature(target);
    }

    return [...new Set(words)].slice(0, 30);
  }

  function ruleWordsFromKeywords(keywords) {
    const positive = [];
    const negative = [];
    const add = (target, words) => {
      for (const word of words) {
        const value = norm(word);
        if (value) target.push(value);
      }
    };
    const sourceKeywords = keywords.length ? keywords : [currentSearchKeyword()].filter(Boolean);
    const nature = resolveJobNature(document.querySelector("#baf-job-nature")?.value || config.filters.jobNature || "");
    const profile = keywordProfileFromPanel();
    add(positive, sourceKeywords);
    for (const keyword of sourceKeywords) {
      const lower = keyword.toLowerCase();
      if (/教育|课程|培训/.test(lower)) {
        add(negative, ["招生", "课程销售"]);
      }
    }
    if (nature === "sales") {
      add(positive, profile.targets.flatMap(target => [`${target}销售`, `${target}商务`, `${target}大客户销售`]));
      add(negative, ["保险", "贷款", "营业员", "店员", "电话销售"]);
    }
    if (nature === "customer_success") {
      add(positive, profile.targets.flatMap(target => [`${target}客户成功`, `${target}客户运营`, `${target}续费`]));
      add(negative, ["纯销售", "电话销售", "客服坐席"]);
    }
    if (nature === "presales") {
      add(positive, profile.targets.flatMap(target => [`${target}售前`, `${target}解决方案`, `${target}方案顾问`]));
      add(negative, ["纯电销", "客服坐席", "电话客服"]);
    }
    if (nature === "operations") {
      add(positive, profile.targets.flatMap(target => [`${target}运营`, `${target}客户运营`, `${target}用户运营`, `${target}增长运营`, `${target}平台运营`]));
      add(negative, ["纯销售", "电话销售", "客服专员"]);
    }
    if (nature === "product") {
      add(positive, profile.targets.flatMap(target => [`${target}产品`, `${target}产品经理`, `${target}产品运营`, `${target}需求分析`, `${target}平台产品`]));
      add(negative, ["纯销售", "电话销售", "客服专员"]);
    }
    if (nature === "tech") {
      add(positive, profile.targets.flatMap(target => [`${target}工程师`, `${target}开发`, `${target}技术支持`]));
      add(negative, ["销售代表", "客户经理", "电话销售"]);
    }
    add(negative, ["保险", "贷款", "营业员", "店员"]);
    return {
      positive: sanitizePositiveWordsByNature(positive, RULE_SEED_LIMIT),
      negative: [...new Set(filterConflictingNegativeWords(negative))].slice(0, RULE_SEED_LIMIT)
    };
  }

  function currentSearchKeyword() {
    const url = new URL(location.href);
    const fromUrl = url.searchParams.get("query");
    if (fromUrl !== null) return norm(fromUrl);
    return "";
  }

  function currentCampaignKeywordLabel() {
    return state.campaign?.active || state.campaign?.paused
      ? keywordLabel(keywordFromCampaign())
      : currentQueryLabel();
  }

  function parseSearchKeywords() {
    const keywords = parseKeywordList(document.querySelector("#baf-keywords")?.value || "");
    const expandedKeywords = document.querySelector("#baf-expand-keywords")?.checked
      ? expandSearchKeywords(keywords, { nature: resolveJobNature(document.querySelector("#baf-job-nature")?.value || config.filters.jobNature || "") })
      : keywords;
    const orderedKeywords = [...expandedKeywords];
    if (document.querySelector("#baf-include-blank")?.checked) {
      orderedKeywords.push("");
    }
    const unique = [];
    const seen = new Set();
    for (const keyword of orderedKeywords) {
      const key = keyword.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(keyword);
    }
    if (!unique.length) unique.push(currentSearchKeyword());
    return unique;
  }

  function currentQueryLabel() {
    return keywordLabel(currentSearchKeyword());
  }

  function parseSalaryRange(text) {
    const source = norm(text)
      .replace(/,/g, "")
      .replace(/[－—–~～至到]/g, "-")
      .replace(/[Ｋｋ]/g, "K");
    const toK = (num, unit, fallbackUnit = "") => {
      const value = Number(num);
      const finalUnit = unit || fallbackUnit;
      if (!Number.isFinite(value)) return null;
      if (/万|w/i.test(finalUnit)) return value * 10;
      if (/元/.test(finalUnit)) return value / 1000;
      return value;
    };
    const build = (match, minRaw, minUnit, maxRaw, maxUnit, isYearly = false) => {
      const fallbackUnit = maxUnit || minUnit || "";
      let min = toK(minRaw, minUnit, fallbackUnit);
      let max = toK(maxRaw, maxUnit, fallbackUnit);
      if (min === null || max === null) return null;
      if (!fallbackUnit && min < 200 && max < 200) {
        min = Number(minRaw);
        max = Number(maxRaw);
      }
      if (isYearly) {
        min = min / 12;
        max = max / 12;
      }
      if (min > max) [min, max] = [max, min];
      return { min, max, raw: match[0] };
    };

    let match = source.match(/(\d+(?:\.\d+)?)\s*万\s*-\s*(\d+(?:\.\d+)?)\s*万\s*\/?\s*年/);
    if (match) return build(match, match[1], "万", match[2], "万", true);

    match = source.match(/(\d+(?:\.\d+)?)\s*([kK千万wW]?)\s*-\s*(\d+(?:\.\d+)?)\s*([kK千万wW])\s*(?:·?\s*\d+\s*薪)?/);
    if (match) return build(match, match[1], match[2], match[3], match[4]);

    match = source.match(/(\d{3,6})\s*(?:元)?\s*-\s*(\d{3,6})\s*元\s*\/?\s*月?/);
    if (match) return build(match, match[1], "元", match[2], "元");

    match = source.match(/(\d+(?:\.\d+)?)\s*([kK千万wW])\s*-\s*(\d+(?:\.\d+)?)\s*([kK千万wW])?\s*\/?\s*月/);
    if (match) return build(match, match[1], match[2], match[3], match[4] || match[2]);

    match = source.match(/(\d+(?:\.\d+)?)\s*([kK千万wW])\s*(?:·?\s*\d+\s*薪)?/);
    if (match) {
      const value = toK(match[1], match[2]);
      if (value !== null) return { min: value, max: value, raw: match[0] };
    }
    return null;
  }

  function evaluateFilters(text) {
    const notes = [];
    const negatives = [];
    let hardExcluded = false;
    const salaryMin = Number(config.filters.salaryMin || 0);
    const salaryMax = Number(config.filters.salaryMax || 0);
    if (salaryMin || salaryMax) {
      const parsed = parseSalaryRange(text);
      if (!parsed) {
        notes.push("薪资未识别，未参与薪资过滤");
      } else {
        const targetMin = salaryMin || 0;
        const targetMax = salaryMax || 999;
        const overlaps = parsed.max >= targetMin && parsed.min <= targetMax;
        if (!overlaps) {
          hardExcluded = true;
          negatives.push(`薪资不匹配(${parsed.raw})`);
        } else {
          notes.push(`薪资匹配(${parsed.raw})`);
        }
      }
    }
    return { hardExcluded, negatives, notes };
  }

  function currentCompanyScaleLabel() {
    const codes = (new URL(location.href).searchParams.get("scale") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (!codes.length) return "不限";
    return SCALE_OPTIONS
      .filter(x => codes.includes(x.code))
      .map(x => x.label)
      .join("、") || "未识别";
  }

  function scoreJob(text) {
    const source = norm(text);
    const lower = source.toLowerCase();
    const titlePart = source.slice(0, 120);
    let score = 0;
    let globalScoreCap = 100;
    const hits = [];
    const negatives = [];
    const requiredWords = activeTargetKeywords();
    const hasRequired = requiredWords.length > 0 && requiredWords.some(word => targetKeywordMatches(source, word));

    for (const k of config.positive.high) {
      if (lower.includes(k.toLowerCase())) {
        score += 22;
        hits.push(k);
      }
    }
    for (const k of config.positive.medium) {
      if (lower.includes(k.toLowerCase())) {
        score += 10;
        hits.push(k);
      }
    }
    for (const k of config.positive.low) {
      if (lower.includes(k.toLowerCase())) {
        score += 5;
        hits.push(k);
      }
    }
    for (const k of config.filters.customPositive) {
      if (lower.includes(k.toLowerCase())) {
        score += 12;
        hits.push(`自定义正向:${k}`);
      }
    }

    let hardExcluded = false;
    for (const k of filterConflictingNegativeWords(config.negative.hard)) {
      if (lower.includes(k.toLowerCase())) {
        score -= 40;
        hardExcluded = true;
        negatives.push(k);
      }
    }
    for (const k of filterConflictingNegativeWords(config.negative.soft)) {
      if (lower.includes(k.toLowerCase())) {
        score -= 12;
        negatives.push(k);
      }
    }
    for (const k of config.filters.customNegative) {
      if (lower.includes(k.toLowerCase())) {
        score -= 25;
        negatives.push(`自定义反向:${k}`);
      }
    }
    const aiStrategy = activeAiStrategy()?.strategy;
    for (const k of sanitizeAiWords(aiStrategy?.positiveReference || [], 80)) {
      if (lower.includes(k.toLowerCase())) {
        score += 8;
        hits.push(`策略加分:${k}`);
      }
    }
    for (const k of filterConflictingNegativeWords(sanitizeAiWords(aiStrategy?.directExclude || [], 80))) {
      if (lower.includes(k.toLowerCase())) {
        score -= 35;
        hardExcluded = true;
        negatives.push(`策略排除:${k}`);
      }
    }
    if (!requiredWords.length) {
      score -= 25;
      negatives.push(targetDirectionIssue());
    } else if (!hasRequired) {
      score -= 25;
      negatives.push("缺少目标方向关键词");
    }
    const targetResult = scoreByTargetDirection(source);
    score += targetResult.scoreDelta;
    if (Number.isFinite(targetResult.scoreCap)) globalScoreCap = Math.min(globalScoreCap, targetResult.scoreCap);
    hits.push(...targetResult.hits);
    negatives.push(...targetResult.negatives);
    const natureResult = scoreByJobNature(source, titlePart);
    score += natureResult.scoreDelta;
    hits.push(...natureResult.hits);
    negatives.push(...natureResult.negatives);
    hardExcluded = hardExcluded || natureResult.hardExcluded;
    const fitResult = scoreByFitGate(source, titlePart, score);
    score += fitResult.scoreDelta;
    if (Number.isFinite(fitResult.scoreCap)) globalScoreCap = Math.min(globalScoreCap, fitResult.scoreCap);
    hits.push(...fitResult.hits);
    negatives.push(...fitResult.negatives);
    hardExcluded = hardExcluded || fitResult.hardExcluded;
    score = Math.max(0, Math.min(100, globalScoreCap, score));
    return {
      score,
      hits: [...new Set(hits)],
      negatives: [...new Set(negatives)],
      hardExcluded,
      reviewNotes: [...new Set([...targetResult.reviewNotes, ...fitResult.reviewNotes])]
    };
  }

  class LlmJudgementError extends Error {
    constructor(message, detail = {}) {
      super(message);
      this.name = "LlmJudgementError";
      this.detail = detail;
    }
  }

  function normalizeLlmAction(action, score, hardExcluded) {
    const raw = norm(action).toLowerCase();
    if (hardExcluded || /exclude|skip|reject|排除|跳过|不合适/.test(raw)) return "exclude";
    if (/favorite|collect|收藏|高匹配/.test(raw)) return "favorite";
    if (/review|复核|待定|人工/.test(raw)) return "review";
    if (score >= config.threshold) return "favorite";
    if (score >= REVIEW_THRESHOLD) return "review";
    return "exclude";
  }

  function normalizeLlmJudgement(parsed, localResult, filterResult) {
    const hits = Array.isArray(parsed?.hits) ? parsed.hits.map(norm).filter(Boolean) : [];
    const negatives = Array.isArray(parsed?.negatives) ? parsed.negatives.map(norm).filter(Boolean) : [];
    const reviewNotes = Array.isArray(parsed?.reviewNotes) ? parsed.reviewNotes.map(norm).filter(Boolean) : [];
    const hardExcluded = Boolean(parsed?.hardExcluded || filterResult.hardExcluded);
    const score = safeNumber(parsed?.score, localResult.score, 1, 100);
    const action = normalizeLlmAction(parsed?.action || parsed?.recommendation, score, hardExcluded);
    return {
      score,
      action,
      hits: hits.length ? hits : localResult.hits.slice(0, 8),
      negatives: [...new Set([...negatives, ...filterResult.negatives])],
      filterNotes: filterResult.notes,
      reviewNotes,
      hardExcluded,
      mainReason: norm(parsed?.mainReason || parsed?.reason || ""),
      decisionLog: norm(parsed?.decisionLog || parsed?.analysis || ""),
      recommendedAction: norm(parsed?.recommendedAction || "")
    };
  }

  function jobJudgementPromptPayload(job, detail, localResult, filterResult) {
    return {
      job: {
        title: job.title,
        href: job.href,
        cardText: norm(job.cardText || "").slice(0, 1600),
        detailText: norm(detail || "").slice(0, 5000),
        searchKeyword: currentCampaignKeywordLabel(),
        companyScale: currentCompanyScaleLabel()
      },
      userConfig: {
        jobNature: jobNatureDisplayValue(config.filters.jobNature) || "不限",
        targetDirections: activeTargetKeywords().slice(0, 20),
        salaryMinK: config.filters.salaryMin || "",
        salaryMaxK: config.filters.salaryMax || "",
        favoriteScore: config.threshold,
        reviewScore: REVIEW_THRESHOLD,
        customPositive: (config.filters.customPositive || []).slice(0, 30),
        customNegative: (config.filters.customNegative || []).slice(0, 30)
      },
      screeningStrategy: screeningStrategySnapshot(),
      localReference: {
        score: localResult.score,
        hits: localResult.hits.slice(0, 20),
        negatives: [...localResult.negatives, ...filterResult.negatives].slice(0, 20),
        reviewNotes: localResult.reviewNotes.slice(0, 10),
        hardExcluded: Boolean(localResult.hardExcluded || filterResult.hardExcluded),
        filterNotes: filterResult.notes
      },
      outputSchema: {
        score: "1-100 integer",
        action: "favorite | review | exclude",
        hits: ["命中的正向理由"],
        negatives: ["扣分或排除理由"],
        reviewNotes: ["需要人工复核的疑点"],
        hardExcluded: "boolean",
        mainReason: "一句话主因",
        decisionLog: "简短说明为什么给这个分和动作",
        recommendedAction: "已自动收藏 | 人工复核 | 跳过"
      }
    };
  }

  async function judgeJobWithLlm(job, detail, localResult, filterResult) {
    if (!aiConfigured()) {
      throw new LlmJudgementError("缺少 API Key，无法进行 LLM 岗位判断");
    }
    const payload = jobJudgementPromptPayload(job, detail, localResult, filterResult);
    const messages = [
      {
        role: "system",
        content: [
          "你是 BOSS 直聘岗位筛选助手。必须只返回 JSON 对象，不要 Markdown。",
          "你要根据用户的岗位性质、目标方向、薪资边界、加分词和排除词判断岗位是否值得收藏。",
          "本地规则结果只是参考；最终 score/action/mainReason 必须由你独立判断。",
          "score 必须是 1-100 的细分整数分，按岗位匹配度自由评分；不要只给 55、60、70 这类粗略阈值分。",
          "如果岗位性质或目标方向不匹配，不能给 favorite；高风险、明显不相关或命中硬排除时 action=exclude。",
          "action 只能是 favorite、review、exclude。收藏线和复核线只用于动作建议，不限制 score 的具体数值。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ];
    try {
      const content = await callDeepSeek(messages, 1200);
      const parsed = parseAiJson(content);
      return normalizeLlmJudgement(parsed, localResult, filterResult);
    } catch (error) {
      throw new LlmJudgementError(`LLM 岗位判断失败：${String(error?.message || error)}`, {
        title: job.title,
        href: job.href
      });
    }
  }

  function hasAny(text, words) {
    const source = norm(text).toLowerCase();
    return words.some(word => source.includes(word.toLowerCase()));
  }

  function activeTargetKeywords() {
    const words = config.filters.targetKeywords?.length
      ? config.filters.targetKeywords
      : [];
    return [...new Set([
      ...words,
      ...targetHintsFromSearchKeyword(currentSearchKeyword()),
      ...targetHintsFromSearchKeyword(keywordFromCampaign())
    ].map(norm).filter(Boolean))];
  }

  function targetHintsFromSearchKeyword(keyword) {
    const source = norm(keyword);
    if (!source) return [];
    const nature = resolveJobNature(config.filters.jobNature || "");
    const roleWordsByNature = {
      sales: ["大客户销售", "销售顾问", "销售经理", "销售代表", "客户经理", "渠道销售", "解决方案销售", "销售工程师", "项目销售", "销售", "商务", "BD", "bd", "KA", "ka", "大客户"],
      customer_success: ["客户成功经理", "客户成功", "客户运营", "续费", "交付"],
      presales: ["解决方案销售", "解决方案", "售前", "方案顾问", "方案"],
      operations: ["用户运营", "商家运营", "增长运营", "渠道运营", "平台运营", "项目运营", "产品运营", "销售运营", "客户运营", "运营"],
      product: ["产品经理", "产品运营", "产品"],
      tech: ["应用工程师", "开发工程师", "算法工程师", "工程师", "开发", "技术支持"]
    };
    const roleWords = roleWordsByNature[nature] || Object.values(roleWordsByNature).flat();
    const hints = [source];
    let stripped = source;
    for (const role of roleWords) {
      stripped = stripped.replace(new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "");
    }
    stripped = norm(stripped);
    if (stripped && stripped !== source) hints.push(stripped);
    return hints;
  }

  function scoreByTargetDirection(source) {
    const targetWords = activeTargetKeywords();
    const usefulTargetWords = targetWords.filter(word => !isBroadTargetKeyword(word));
    const broadTargetWords = targetWords.filter(isBroadTargetKeyword);
    const hits = [];
    const negatives = [];
    const reviewNotes = [];
    let scoreDelta = 0;
    let scoreCap = 100;
    if (!targetWords.length) {
      scoreCap = 0;
      const issue = targetDirectionIssue();
      negatives.push(issue);
      reviewNotes.push("先填写目标方向，再扫描岗位");
      return { scoreDelta, scoreCap, hits, negatives, reviewNotes };
    }

    const matchedUseful = usefulTargetWords.filter(word => targetKeywordMatches(source, word));
    const matchedBroad = broadTargetWords.filter(word => targetKeywordMatches(source, word));
    const matched = matchedUseful.length ? matchedUseful : matchedBroad;
    if (matched.length) {
      if (matchedUseful.length) {
        scoreDelta += 24;
      } else {
        scoreDelta += 8;
        scoreCap = Math.min(scoreCap, 55);
        reviewNotes.push("目标方向太泛，已降级为人工复核");
      }
      hits.push(`目标方向:${matched.slice(0, 3).join("/")}`);
    } else {
      scoreCap = 45;
      negatives.push("缺少目标方向关键词");
      reviewNotes.push("岗位性质可能匹配，但没有命中目标方向");
    }
    return { scoreDelta, scoreCap, hits, negatives, reviewNotes };
  }

  function targetKeywordMatches(source, word) {
    const text = norm(source);
    const lower = text.toLowerCase();
    const keyword = norm(word);
    const keywordLower = keyword.toLowerCase();
    if (!keyword) return false;
    if (keywordLower === "agent") {
      if (/专利\s*agent/i.test(text)) return false;
      return /ai\s*agent/i.test(text) ||
        /agent\s*(销售|售前|解决方案|应用|产品|客服|智能体)/i.test(text) ||
        /(销售|售前|解决方案|应用|产品|客服)\s*agent/i.test(text) ||
        /智能体/.test(text);
    }
    return lower.includes(keywordLower);
  }

  function scoreByJobNature(source, titlePart) {
    const nature = resolveJobNature(config.filters.jobNature || "");
    const hits = [];
    const negatives = [];
    let scoreDelta = 0;
    let hardExcluded = false;
    if (nature === "any") return { scoreDelta, hits, negatives, hardExcluded };

    const salesWords = ["销售", "BD", "商务", "大客户", "客户经理", "客户代表", "客户开发", "销售顾问", "商务拓展", "渠道", "KA"];
    const csWords = ["客户成功", "客户运营", "续费", "续签", "交付", "培训", "复购", "扩容", "客户满意度"];
    const presalesWords = ["售前", "解决方案", "方案顾问", "实施顾问", "POC", "需求调研", "产品演示", "方案演示"];
    const opsWords = ["运营", "商家运营", "平台运营", "用户运营", "增长运营", "数据运营", "活动运营", "渠道运营"];
    const productWords = ["产品经理", "产品运营", "产品负责人", "产品总监", "产品Leader", "产品设计", "PM"];
    const techWords = ["工程师", "开发", "研发", "算法", "前端", "后端", "Java", "Python", "测试", "运维", "架构", "模型训练", "技术支持", "应用工程师"];
    const titleHasTech = hasAny(titlePart, techWords);
    const titleHasBusiness = hasAny(titlePart, [...salesWords, ...csWords, ...presalesWords, "顾问"]);
    const sourceHasTech = hasAny(source, techWords);
    const sourceHasSales = hasAny(source, salesWords);
    const sourceHasCs = hasAny(source, csWords);
    const sourceHasPresales = hasAny(source, presalesWords);
    const sourceHasOps = hasAny(source, opsWords);
    const sourceHasProduct = hasAny(source, productWords);

    if (nature === "sales") {
      if (sourceHasSales) {
        scoreDelta += 18;
        hits.push("岗位性质:销售");
      }
      if (sourceHasCs || sourceHasPresales) {
        scoreDelta += 5;
        hits.push("岗位性质相近");
      }
      if (titleHasTech && !titleHasBusiness) {
        scoreDelta -= 55;
        hardExcluded = true;
        negatives.push("岗位性质不匹配:技术岗");
      } else if (sourceHasTech && !sourceHasSales && !sourceHasCs && !sourceHasPresales) {
        scoreDelta -= 30;
        negatives.push("岗位性质偏技术");
      }
    }

    if (nature === "customer_success") {
      if (sourceHasCs) {
        scoreDelta += 18;
        hits.push("岗位性质:客户成功");
      }
      if (sourceHasPresales || sourceHasSales) scoreDelta += 4;
      if (titleHasTech && !titleHasBusiness) {
        scoreDelta -= 45;
        hardExcluded = true;
        negatives.push("岗位性质不匹配:技术岗");
      }
    }

    if (nature === "presales") {
      if (sourceHasPresales) {
        scoreDelta += 18;
        hits.push("岗位性质:售前/方案");
      }
      if (sourceHasCs || sourceHasSales) scoreDelta += 4;
      if (titleHasTech && !titleHasBusiness && !hasAny(titlePart, ["售前", "解决方案", "方案"])) {
        scoreDelta -= 35;
        negatives.push("岗位性质偏纯技术");
      }
    }

    if (nature === "operations") {
      if (sourceHasOps) {
        scoreDelta += 18;
        hits.push("岗位性质:运营");
      }
      if (sourceHasSales && !sourceHasOps) {
        scoreDelta -= 12;
        negatives.push("岗位性质偏销售");
      }
      if (titleHasTech && !titleHasBusiness) {
        scoreDelta -= 45;
        hardExcluded = true;
        negatives.push("岗位性质不匹配:技术岗");
      }
    }

    if (nature === "product") {
      if (sourceHasProduct) {
        scoreDelta += 18;
        hits.push("岗位性质:产品");
      }
      if (sourceHasSales && !sourceHasProduct) {
        scoreDelta -= 12;
        negatives.push("岗位性质偏销售");
      }
      if (sourceHasTech && !sourceHasProduct) {
        scoreDelta -= 12;
        negatives.push("岗位性质偏技术");
      }
    }

    if (nature === "tech") {
      if (sourceHasTech) {
        scoreDelta += 18;
        hits.push("岗位性质:技术");
      }
      if (sourceHasSales && !sourceHasTech) {
        scoreDelta -= 30;
        negatives.push("岗位性质偏销售");
      }
    }

    return { scoreDelta, hits, negatives, hardExcluded };
  }

  function scoreByFitGate(source, titlePart, currentScore) {
    const hits = [];
    const negatives = [];
    const reviewNotes = [];
    let scoreDelta = 0;
    let scoreCap = 100;
    let hardExcluded = false;
    const title = norm(titlePart);
    const configuredNature = resolveJobNature(config.filters.jobNature || "");

    const targetSalesRoles = [
      "AI销售", "AI应用销售", "AI客服销售", "SaaS销售", "saas销售", "软件销售",
      "销售", "销售岗", "销售专员", "销售主管", "销售经理", "销售顾问", "销售代表",
      "销售团队", "销售管理", "大客户销售", "客户经理", "客户代表", "商务拓展",
      "商务经理", "BD", "KA销售"
    ];
    const acceptableRoles = [
      "客户成功", "客户运营", "售前", "解决方案", "方案顾问",
      "交付顾问", "实施顾问", "传统SaaS销售", "普通软件销售"
    ];
    const opsRoles = ["运营", "商家运营", "平台运营", "用户运营", "增长运营", "数据运营", "活动运营", "渠道运营"];
    const productRoles = ["产品经理", "产品运营", "产品负责人", "产品总监", "产品Leader", "产品设计", "PM"];
    const techRoles = ["工程师", "开发", "研发", "算法", "前端", "后端", "Java", "Python", "测试", "运维", "架构", "技术支持"];
    const badTitleRoles = [
      "全栈工程师", "AI应用工程师", "AI应用开发工程师", "应用开发工程师",
      "应用工程师", "开发工程师", "算法工程师", "研发工程师",
      "前端工程师", "后端工程师", "测试工程师", "运维工程师",
      "解决方案工程师", "技术支持", "产品经理", "项目经理",
      "产品总监", "产品Leader", "产品运营", "增长运营", "直播运营",
      "营销策划", "行业顾问", "训练师", "客服专员", "售后客服",
      "架构师", "Java", "Python"
    ];
    const targetScenes = activeTargetKeywords();
    const supportScenes = ["SaaS", "saas", "CRM", "ERP", "OA", "飞书", "钉钉", "办公协同", "企业微信", "企业软件", "软件系统", "呼叫中心"];
    const weakScenes = ["AI", "人工智能", "智能", "软件", "企业服务", "数字化"];
    const nonTargetVerticals = ["口腔", "汽车", "智能制造", "电力", "电网", "中医", "医生", "医美"];
    const outsourcingWords = ["外包", "定制开发", "网站建设", "小程序"];
    const phoneWords = ["电话销售", "电销"];

    const titleHasSales = hasAny(title, targetSalesRoles);
    const titleHasAcceptable = hasAny(title, acceptableRoles);
    const titleHasOps = hasAny(title, opsRoles);
    const titleHasProduct = hasAny(title, productRoles);
    const titleHasTech = hasAny(title, techRoles) || (/工程师/.test(title) && !/销售工程师/.test(title));
    const titleHasConfiguredRole =
      configuredNature === "any" ||
      (configuredNature === "sales" && titleHasSales) ||
      (configuredNature === "customer_success" && titleHasAcceptable) ||
      (configuredNature === "presales" && titleHasAcceptable) ||
      (configuredNature === "operations" && titleHasOps) ||
      (configuredNature === "product" && titleHasProduct) ||
      (configuredNature === "tech" && titleHasTech);
    const titleHasBadRole = (hasAny(title, badTitleRoles) || titleHasTech) && !titleHasConfiguredRole;
    const hasStrongScene = hasAny(source, targetScenes);
    const hasSupportScene = hasAny(source, supportScenes);
    const hasWeakScene = hasAny(source, weakScenes);
    const hasNonTargetVertical = hasAny(title, nonTargetVerticals);
    const hasOutsourcing = hasAny(source, outsourcingWords);
    const hasPhoneSales = hasAny(source, phoneWords);

    if (titleHasBadRole && !titleHasConfiguredRole) {
      hardExcluded = true;
      scoreDelta -= 70;
      negatives.push("岗位角色不匹配");
    }

    if (hasNonTargetVertical && !hasStrongScene) {
      hardExcluded = true;
      scoreDelta -= 55;
      negatives.push("非目标行业场景");
    }

    if (hasOutsourcing) {
      if (hasStrongScene && titleHasConfiguredRole) {
        scoreDelta -= 8;
        scoreCap = Math.min(scoreCap, 59);
        reviewNotes.push("含外包/定制开发，但有目标场景，建议人工看");
      } else {
        hardExcluded = true;
        scoreDelta -= 45;
        negatives.push("外包/定制开发且目标场景不明确");
      }
    }

    if (titleHasConfiguredRole && hasStrongScene) {
      scoreDelta += 18;
      hits.push("目标岗位匹配");
    } else if (titleHasConfiguredRole && (hasSupportScene || hasWeakScene)) {
      scoreCap = Math.min(scoreCap, 58);
      reviewNotes.push("岗位性质匹配，但目标方向不够明确");
    } else if (titleHasAcceptable && hasStrongScene) {
      scoreDelta -= 4;
      scoreCap = Math.min(scoreCap, 59);
      reviewNotes.push("可接受岗位，优先级低");
    } else if (!titleHasConfiguredRole && !titleHasAcceptable && !hardExcluded) {
      scoreCap = Math.min(scoreCap, 45);
      negatives.push("岗位性质不匹配");
    }

    if (!hasStrongScene) {
      scoreCap = Math.min(scoreCap, titleHasConfiguredRole && hasWeakScene ? 58 : 45);
      negatives.push("缺少明确目标方向场景");
    }

    if (hasPhoneSales) {
      if (hasStrongScene) {
        scoreDelta -= 4;
        reviewNotes.push("电话销售，但有目标方向场景");
      } else {
        scoreCap = Math.min(scoreCap, 50);
        negatives.push("电销但目标方向不明确");
      }
    }

    if (!hardExcluded && currentScore + scoreDelta >= 50 && currentScore + scoreDelta < config.threshold) {
      reviewNotes.push("接近收藏分，建议人工复核");
    }

    return { scoreDelta, scoreCap, hits, negatives, reviewNotes, hardExcluded };
  }

  function resolveJobNature(value) {
    const source = norm(value).toLowerCase();
    if (!source || /不限|任意|全部|any/.test(source)) return "any";
    if (/客户成功|客户运营|续费|续签|交付|实施|培训|复购|扩容/.test(source)) return "customer_success";
    if (/售前|解决方案|方案|顾问|poc|pre[-\s]?sales/i.test(source)) return "presales";
    if (/产品经理|产品运营|产品负责人|产品总监|产品leader|产品设计|pm/i.test(source)) return "product";
    if (/运营|增长|用户|商家运营|平台运营|渠道运营|活动/.test(source)) return "operations";
    if (/技术|工程师|开发|研发|算法|前端|后端|测试|运维|架构|java|python|\bai\b/.test(source)) return "tech";
    if (/销售|bd|商务|大客户|客户经理|客户代表|ka|渠道|拓展/.test(source)) return "sales";
    return "any";
  }

  function jobNatureDisplayValue(value) {
    const raw = norm(value);
    const lower = raw.toLowerCase();
    if (lower === "sales") return "销售";
    if (lower === "customer_success") return "客户成功";
    if (lower === "presales") return "售前";
    if (lower === "operations") return "运营";
    if (lower === "product") return "产品";
    if (lower === "tech") return "技术";
    if (lower === "any") return "";
    return raw;
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 120 && r.top < window.innerHeight - 20;
  }

  function isJavascriptHref(el) {
    return /^javascript:/i.test(String(el?.getAttribute?.("href") || "").trim());
  }

  function safeElementClick(el) {
    if (!el) return false;
    if (isJavascriptHref(el)) {
      el.addEventListener("click", event => {
        event.preventDefault();
      }, { capture: true, once: true });
    }
    el.click();
    return true;
  }

  function jobListContainer() {
    const candidates = Array.from(document.querySelectorAll("div,section,main,ul"))
      .filter(el => !el.closest("#boss-ai-autofav-panel"))
      .map(el => {
        const r = el.getBoundingClientRect();
        const links = Array.from(el.querySelectorAll('a[href*="/job_detail/"]')).filter(a => visible(a));
        return { el, r, count: links.length, area: Math.max(1, r.width * r.height) };
      })
      .filter(x =>
        x.count >= 2 &&
        x.r.left < window.innerWidth * 0.55 &&
        x.r.width > 220 &&
        x.r.height > 160 &&
        x.r.bottom > 180
      )
      .sort((a, b) =>
        b.count - a.count ||
        a.r.left - b.r.left ||
        a.area - b.area
      );
    return candidates[0]?.el || document;
  }

  function getJobLinks() {
    const seen = new Set();
    const root = jobListContainer();
    return Array.from(root.querySelectorAll('a[href*="/job_detail/"]'))
      .filter(a => visible(a))
      .map(a => {
        const href = a.href;
        const title = norm(a.textContent);
        if (!href || !title || seen.has(href)) return null;
        seen.add(href);
        let card = a;
        for (let i = 0; i < 5 && card.parentElement; i++) {
          const parentText = norm(card.parentElement.textContent);
          if (parentText.length > norm(card.textContent).length + 20 && parentText.length < 1200) {
            card = card.parentElement;
          }
        }
        return { href, title, card, cardText: norm(card.textContent) };
      })
      .filter(Boolean);
  }

  function jobListSignature(limit = 8) {
    const links = getJobLinks().slice(0, limit);
    return links.map(job => `${job.href}|${job.title}`).join("||");
  }

  function extractRelevantDetail(text) {
    let source = norm(text);
    const startMarkers = ["职位描述", "职位详情", "岗位职责", "岗位要求", "职位要求"];
    const startIndexes = startMarkers
      .map(k => source.indexOf(k))
      .filter(i => i >= 0);
    if (startIndexes.length) {
      source = source.slice(Math.min(...startIndexes));
    }

    const endMarkers = [
      "工作地址", "查看更多信息", "求职工具", "热门职位", "热门城市",
      "热门企业", "附近城市", "BOSS岗位粗筛助手"
    ];
    const endIndexes = endMarkers
      .map(k => source.indexOf(k))
      .filter(i => i > 0);
    if (endIndexes.length) {
      source = source.slice(0, Math.min(...endIndexes));
    }
    return norm(source);
  }

  function rightPanelText() {
    return detailSnapshot().detailText;
  }

  function canonicalJobHref(href) {
    try {
      const url = new URL(href, location.href);
      return `${url.origin}${url.pathname}`;
    } catch (_) {
      return String(href || "").split(/[?#]/)[0];
    }
  }

  function rightPanelCandidate() {
    const vw = window.innerWidth;
    const minLeft = Math.max(300, vw * 0.22);
    const candidates = Array.from(document.querySelectorAll("div,section,main,article"))
      .filter(el => !el.closest("#boss-ai-autofav-panel"))
      .map(el => {
        const r = el.getBoundingClientRect();
        const fullText = norm(el.innerText || el.textContent);
        const detailText = extractRelevantDetail(fullText);
        const hrefs = Array.from(el.querySelectorAll('a[href*="/job_detail/"]'))
          .map(a => canonicalJobHref(a.href))
          .filter(Boolean);
        const hasDetailMarker = /职位描述|职位详情|岗位职责|岗位要求|职位要求/.test(fullText);
        const hasActionMarker = /立即沟通|收藏|BOSS直聘|工作地址/.test(fullText);
        return { el, r, fullText, detailText, hrefs, hasDetailMarker, hasActionMarker };
      })
      .filter(x =>
        x.r.left > minLeft &&
        x.r.top > 120 &&
        x.r.width > 280 &&
        x.r.height > 180 &&
        x.fullText.length > 80
      )
      .sort((a, b) => {
        const aScore = (a.hasDetailMarker ? 1000 : 0) + (a.hasActionMarker ? 120 : 0) + Math.min(a.fullText.length, 5000) / 20;
        const bScore = (b.hasDetailMarker ? 1000 : 0) + (b.hasActionMarker ? 120 : 0) + Math.min(b.fullText.length, 5000) / 20;
        if (aScore !== bScore) return bScore - aScore;
        return Math.abs(a.r.left - vw * 0.36) - Math.abs(b.r.left - vw * 0.36);
      });
    return candidates[0] || null;
  }

  function primaryTitleText(text) {
    return norm(text)
      .replace(/\s+\d+(?:\.\d+)?\s*[-~－—到]\s*\d+(?:\.\d+)?\s*(?:K|k|千|万|元).*$/, "")
      .replace(/\s+\d+(?:\.\d+)?\s*(?:K|k|千|万|元).*$/, "")
      .replace(/^猎头\s*/, "")
      .trim();
  }

  function extractJobCodes(text) {
    const matches = String(text || "").match(/J\d{3,}/gi) || [];
    return [...new Set(matches.map(item => item.toUpperCase()))];
  }

  function normalizeJobTitle(text) {
    return primaryTitleText(text)
      .replace(/\([^)]*\)/g, "")
      .replace(/（[^）]*）/g, "")
      .replace(/\b[A-Z]{0,3}\s*J\d{3,}\b/gi, "")
      .replace(/\b[MSLP]\b/gi, "")
      .replace(/^(高级|资深|初级|中级|专家|高级资深|主任|高级主任)/, "")
      .replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function titleVariants(text) {
    const base = normalizeJobTitle(text);
    if (!base) return [];
    const variants = new Set([base]);
    [
      /^(高级|资深|初级|中级|专家|高级资深|主任|高级主任)/,
      /(工程师|专员|经理|主管|负责人|专家|实习)$/
    ].forEach(pattern => {
      const next = base.replace(pattern, "");
      if (next.length >= 3) variants.add(next);
    });
    return [...variants];
  }

  function titleMatchCandidates(job) {
    const raw = [
      job?.title || "",
      primaryTitleText(job?.cardText || "")
    ];
    const candidates = new Set();
    raw.forEach(value => {
      titleVariants(value).forEach(key => {
        if (key.length >= 3) candidates.add(key);
      });
      const key = normalizeJobTitle(value);
      const withoutLevel = key.replace(/[a-z]$/, "");
      if (withoutLevel.length >= 3) candidates.add(withoutLevel);
    });
    return [...candidates].sort((a, b) => b.length - a.length);
  }

  function detailMatchesJob(detailText, job) {
    const detail = normalizeJobTitle(detailText);
    const rawDetail = norm(detailText);
    const jobCodes = extractJobCodes(`${job?.title || ""} ${job?.cardText || ""}`);
    const detailCodes = new Set(extractJobCodes(rawDetail));
    const codeMatched = jobCodes.find(code => detailCodes.has(code));
    if (codeMatched) return { matched: true, strong: true, reason: `code:${codeMatched}` };
    if (jobCodes.length && detailCodes.size) {
      return { matched: false, strong: true, reason: `code_mismatch:${jobCodes.join("/")}` };
    }
    if (!detail) return { matched: false, strong: false, reason: "empty_detail" };

    const title = titleMatchCandidates(job).find(candidate => detail.includes(candidate));
    if (title) return { matched: true, strong: title.length >= 6, reason: `title:${title}` };

    const prefix = titleMatchCandidates(job)
      .filter(candidate => candidate.length >= 8)
      .find(candidate => detail.includes(candidate.slice(0, 8)));
    if (prefix) return { matched: true, strong: false, reason: `prefix:${prefix.slice(0, 8)}` };

    return { matched: false, strong: false, reason: "title_mismatch" };
  }

  function hasStrongDetailMismatch(match) {
    return Boolean(match?.reason && String(match.reason).startsWith("code_mismatch:"));
  }

  function detailLogPayload(result) {
    return {
      signature: result?.signature || "",
      matched: Boolean(result?.matched),
      matchReason: result?.matchReason || "",
      hrefMatched: Boolean(result?.hrefMatched),
      selected: Boolean(result?.selected),
      changed: Boolean(result?.changed),
      textLength: String(result?.text || "").length,
      fullTextLength: String(result?.fullText || "").length,
      textPreview: String(result?.text || result?.fullText || "").replace(/\s+/g, " ").trim().slice(0, 320)
    };
  }

  function detailSnapshot() {
    const candidate = rightPanelCandidate();
    const fullText = candidate?.fullText || "";
    const detailText = candidate?.detailText || extractRelevantDetail(fullText);
    return {
      text: detailText || fullText,
      fullText,
      detailText,
      hrefs: candidate?.hrefs || [],
      signature: norm(fullText || detailText).slice(0, 500)
    };
  }

  function jobCardLooksSelected(job) {
    const nodes = [job?.card, job?.card?.parentElement, job?.card?.parentElement?.parentElement].filter(Boolean);
    return nodes.some(node => {
      const tokens = String(node.className || "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      return node.getAttribute?.("aria-selected") === "true" ||
        tokens.some(token =>
          token === "active" ||
          token === "selected" ||
          token === "current" ||
          token === "cur" ||
          token === "checked" ||
          token.endsWith("-active") ||
          token.includes("selected")
        );
    });
  }

  async function waitForJobDetail(job, beforeSignature, timeoutMs = 5000) {
    const started = Date.now();
    const targetHref = canonicalJobHref(job?.href);
    while (Date.now() - started < timeoutMs) {
      const snapshot = detailSnapshot();
      const changed = Boolean(snapshot.signature && snapshot.signature !== beforeSignature);
      const match = detailMatchesJob(snapshot.fullText || snapshot.text, job);
      const hrefMatched = Boolean(targetHref && snapshot.hrefs.includes(targetHref));
      const selected = jobCardLooksSelected(job);
      const titleConfirmed = match.matched && !hasStrongDetailMismatch(match) && snapshot.text.length > 160;
      const confirmed = hrefMatched || titleConfirmed || (match.matched && (changed || match.strong || selected));
      if (snapshot.text.length > 80 && confirmed) {
        return {
          ok: true,
          text: snapshot.text,
          fullText: snapshot.fullText,
          changed,
          matched: match.matched,
          matchReason: hrefMatched ? "href" : match.reason,
          hrefMatched,
          selected,
          signature: snapshot.signature
        };
      }
      await sleep(250);
    }
    const snapshot = detailSnapshot();
    const match = detailMatchesJob(snapshot.fullText || snapshot.text, job);
    return {
      ok: false,
      text: snapshot.text,
      fullText: snapshot.fullText,
      signature: snapshot.signature,
      matched: match.matched,
      matchReason: match.reason,
      hrefMatched: Boolean(targetHref && snapshot.hrefs.includes(targetHref)),
      selected: jobCardLooksSelected(job)
    };
  }

  class JobDetailNotConfirmedError extends Error {
    constructor(message, detail = {}) {
      super(message);
      this.name = "JobDetailNotConfirmedError";
      this.detail = detail;
    }
  }

  function clickJobCard(job) {
    const detailAnchor = job?.card?.tagName === "A"
      ? job.card
      : job?.card?.querySelector?.('a[href*="/job_detail/"]');
    const clickTarget = detailAnchor || job?.card;
    if (!clickTarget) return { method: "none", href: "" };
    const preventNavigation = event => {
      event.preventDefault();
    };
    detailAnchor?.addEventListener("click", preventNavigation, { capture: true, once: true });
    const r = clickTarget.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: Math.round(r.left + Math.min(24, Math.max(4, r.width / 2))),
      clientY: Math.round(r.top + Math.min(18, Math.max(4, r.height / 2))),
      button: 0,
      buttons: 1
    };
    ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach(type => {
      clickTarget.dispatchEvent(new MouseEvent(type, eventInit));
    });
    if (typeof clickTarget.click === "function") {
      clickTarget.click();
      return { method: "element_click", href: detailAnchor?.href || "" };
    }
    clickTarget.dispatchEvent(new MouseEvent("click", eventInit));
    return { method: "mouse_event", href: detailAnchor?.href || "" };
  }

  function favoriteButtonCandidates() {
    const vw = window.innerWidth;
    return Array.from(document.querySelectorAll("a,button,[role='button']"))
      .map(el => {
        const r = el.getBoundingClientRect();
        const text = norm(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title"));
        return {
          el,
          r,
          text,
          tagScore: /^(A|BUTTON)$/i.test(el.tagName) ? 1 : 0,
          exactScore: /^(收藏|已收藏)$/.test(text) ? 1 : 0
        };
      })
      .filter(x =>
        x.r.left > vw * 0.45 &&
        x.r.top > 120 &&
        x.r.top < 560 &&
        x.r.width >= 20 &&
        x.r.width <= 180 &&
        x.r.height >= 16 &&
        x.r.height <= 80 &&
        /收藏/.test(x.text)
      )
      .sort((a, b) =>
        b.exactScore - a.exactScore ||
        b.tagScore - a.tagScore ||
        a.r.top - b.r.top ||
        (a.r.width * a.r.height) - (b.r.width * b.r.height)
      );
  }

  function favoriteButtonState() {
    const candidate = favoriteButtonCandidates()[0];
    if (!candidate) return { found: false, ok: false, text: "", status: "未找到收藏按钮" };
    if (candidate.text.includes("已收藏") || candidate.text.includes("取消收藏")) {
      return { found: true, ok: true, text: candidate.text, status: "已收藏", el: candidate.el };
    }
    return { found: true, ok: false, text: candidate.text, status: "待收藏", el: candidate.el };
  }

  async function clickFavoriteButton() {
    const before = favoriteButtonState();
    if (!before.found) return before;
    if (before.ok) return before;

    before.el.scrollIntoView({ block: "center", inline: "nearest" });
    safeElementClick(before.el);
    await sleep(900);

    const after = favoriteButtonState();
    if (after.ok) return { ...after, status: "点击后已收藏" };
    if (after.found && after.text !== before.text && (after.text.includes("已收藏") || after.text.includes("取消收藏"))) {
      return { ...after, ok: true, status: "点击后已收藏" };
    }
    return {
      found: after.found,
      ok: false,
      text: after.text || before.text,
      status: `点击后未确认收藏状态：${after.text || before.text || "无按钮文本"}`
    };
  }

  function greetingLimitReached() {
    saveDailyStats();
    const limit = Number(config.greeting?.dailyLimit || 0);
    return config.greeting?.enabled && limit > 0 && Number(state.daily.greeted || 0) >= limit;
  }

  function rightSideInteractiveRoot() {
    const vw = window.innerWidth;
    return Array.from(document.querySelectorAll("div,section,main,article"))
      .map(el => ({ el, r: el.getBoundingClientRect(), text: norm(el.textContent) }))
      .filter(x =>
        x.r.left > vw * 0.35 &&
        x.r.width > 260 &&
        x.r.height > 160 &&
        x.text.length > 40 &&
        !x.el.closest("#boss-ai-autofav-panel")
      )
      .sort((a, b) => a.r.left - b.r.left || b.r.height - a.r.height)[0]?.el || document;
  }

  function greetingButtonCandidates(root = rightSideInteractiveRoot()) {
    return Array.from(root.querySelectorAll("a,button,[role='button']"))
      .map(el => {
        const r = el.getBoundingClientRect();
        const text = norm(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title"));
        return { el, r, text };
      })
      .filter(x =>
        x.r.width > 0 &&
        x.r.height > 0 &&
        x.r.top > 80 &&
        x.r.top < window.innerHeight - 20 &&
        /立即沟通|继续沟通|打招呼|聊一聊|沟通/.test(x.text)
      )
      .sort((a, b) => a.r.top - b.r.top);
  }

  function messageInputCandidates(root = document) {
    return Array.from(root.querySelectorAll("textarea,input,[contenteditable='true']"))
      .map(el => {
        const r = el.getBoundingClientRect();
        const hint = norm(el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.getAttribute("title") || "");
        return { el, r, hint };
      })
      .filter(x =>
        x.r.width > 80 &&
        x.r.height > 18 &&
        x.r.top > 120 &&
        x.r.top < window.innerHeight - 20 &&
        x.r.left > window.innerWidth * 0.35 &&
        !x.el.closest("#boss-ai-autofav-panel") &&
        !/搜索|职位|岗位|公司|query|keyword|search/.test(x.hint) &&
        (/消息|沟通|招呼|输入|发送/.test(x.hint) || x.el.tagName === "TEXTAREA" || x.el.getAttribute("contenteditable") === "true")
      )
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
  }

  function sendButtonCandidates(root = document) {
    return Array.from(root.querySelectorAll("button,[role='button']"))
      .map(el => {
        const r = el.getBoundingClientRect();
        const text = norm(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title"));
        return { el, r, text, disabled: Boolean(el.disabled || el.getAttribute("aria-disabled") === "true") };
      })
      .filter(x =>
        x.r.width > 0 &&
        x.r.height > 0 &&
        x.r.top > 80 &&
        x.r.top < window.innerHeight - 20 &&
        /发送/.test(x.text) &&
        !x.disabled
      )
      .sort((a, b) => a.r.top - b.r.top);
  }

  function closestConversationRoot(el) {
    let current = el;
    for (let i = 0; i < 6 && current?.parentElement; i += 1) {
      current = current.parentElement;
      const hasInput = current.querySelector?.("textarea,input,[contenteditable='true']");
      const hasSend = Array.from(current.querySelectorAll?.("button,[role='button']") || [])
        .some(button => /发送/.test(norm(button.textContent || button.getAttribute("aria-label") || button.getAttribute("title"))));
      if (hasInput && hasSend) return current;
    }
    return document;
  }

  function fillMessageInput(input, text) {
    const el = input.el;
    el.focus();
    if (el.getAttribute("contenteditable") === "true") {
      el.textContent = text;
    } else {
      el.value = text;
    }
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    } catch (_) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function messageInputValue(input) {
    const el = input.el || input;
    return norm(el.getAttribute("contenteditable") === "true" ? el.textContent : el.value);
  }

  async function waitForGreetingSendConfirmation(input, template, timeoutMs = 3500) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = messageInputValue(input);
      if (!value || value !== norm(template)) return true;
      await sleep(250);
    }
    return false;
  }

  async function tryAutoGreeting(job, record) {
    if (!config.greeting?.enabled) return "自动打招呼未开启";
    if (greetingLimitReached()) return `达到今日打招呼上限 ${config.greeting.dailyLimit}`;
    const minScore = safeNumber(config.greeting.minScore, config.threshold, REVIEW_THRESHOLD + 1, 100);
    if (safeNumber(record?.score, 0) < minScore) return `未达到打招呼最低分 ${minScore}`;
    if (job?.href && state.greetedHrefs.has(job.href)) return "该岗位已打过招呼，跳过";
    const template = norm(config.greeting.template || "");
    if (!template) return "未填写打招呼模板";

    const detailRoot = rightSideInteractiveRoot();
    const greetButton = greetingButtonCandidates(detailRoot)[0];
    if (greetButton) {
      greetButton.el.scrollIntoView({ block: "center", inline: "nearest" });
      safeElementClick(greetButton.el);
      await sleep(800);
    }

    const input = messageInputCandidates(detailRoot)[0] || messageInputCandidates(document)[0];
    if (!input) {
      return greetButton ? "已点击沟通按钮，但未找到消息输入框" : "未找到打招呼或消息输入入口";
    }

    fillMessageInput(input, template);
    await sleep(350);
    if (messageInputValue(input) !== template) {
      return "招呼内容写入后校验失败，未发送";
    }
    const conversationRoot = closestConversationRoot(input.el);
    const sendButton = sendButtonCandidates(conversationRoot)[0];
    if (!sendButton) {
      return "已写入招呼模板，未找到同一聊天窗口的发送按钮，未发送";
    }

    safeElementClick(sendButton.el);
    const confirmed = await waitForGreetingSendConfirmation(input, template);
    if (!confirmed) {
      return "已点击发送，但未确认发送成功，未计入今日招呼";
    }
    if (job?.href) {
      state.greetedHrefs.add(job.href);
      saveGreetedHrefs();
    }
    state.daily.greeted = safeNumber(state.daily.greeted, 0, 0) + 1;
    saveDailyStats();
    return "已发送自动打招呼";
  }

  function findJobScroller() {
    const root = jobListContainer();
    const els = [root, ...Array.from(root.querySelectorAll("div,ul,section"))];
    return els
      .map(el => ({
        el,
        count: el.querySelectorAll('a[href*="/job_detail/"]').length,
        scrollable: el.scrollHeight > el.clientHeight + 80,
        r: el.getBoundingClientRect()
      }))
      .filter(x => x.count >= 2 && x.scrollable && x.r.left < window.innerWidth * 0.55)
      .sort((a, b) => b.count - a.count)[0]?.el || document.scrollingElement;
  }

  function countProcessedAttempt() {
    state.scanned += 1;
    state.daily.scanned += 1;
    if (state.campaign?.active || state.campaign?.paused) {
      state.campaign.keywordScanned = Number(state.campaign.keywordScanned || 0) + 1;
      state.campaign.totalScanned = Number(state.campaign.totalScanned || 0) + 1;
      saveCampaign();
    }
    saveDailyStats();
  }

  function log(record) {
    if (!record.transient) {
      persistRecord(record);
    }
    state.logs.unshift(record);
    state.logs = state.logs.slice(0, 120);
    try {
      updatePanel();
    } catch (error) {
      debugLog("update_panel_error", { error: String(error?.message || error) });
    }
  }

  function actionLabel(action) {
    if (action === "favorite") return "已收藏";
    if (action === "review") return "待复核";
    if (action === "exclude") return "已排除";
    if (action === "favorite_failed") return "收藏失败";
    if (action === "user_like") return "用户想看";
    if (action === "user_dislike") return "用户不想看";
    if (action === "error") return "错误";
    return "未收藏";
  }

  function recommendedActionFor(record) {
    if (record.action === "favorite") return "已自动收藏";
    if (record.action === "favorite_failed") return "人工检查收藏状态";
    if (record.action === "review") return "人工复核";
    if (record.action === "exclude") return "跳过";
    if (record.action === "user_like") return "保留并提高相似岗位权重";
    if (record.action === "user_dislike") return "排除相似岗位";
    if (record.action === "error") return "检查页面或规则";
    return record.needsReview ? "人工复核" : "跳过";
  }

  function mainReasonFor(record) {
    const negatives = record.negatives || [];
    const reviewNotes = record.reviewNotes || [];
    const filterNotes = record.filterNotes || [];
    const hits = record.hits || [];
    if (record.action === "favorite_failed") return record.favoriteResult || "点击收藏后未确认状态";
    if (reviewNotes.length) return reviewNotes[0];
    if (negatives.length) return negatives[0];
    if (filterNotes.length) return filterNotes[0];
    if (hits.length) return hits[0];
    if (record.action === "favorite") return "达到收藏分";
    if (record.action === "review") return "分数处于复核区间";
    if (record.action === "exclude") return "分数低于复核线";
    return "";
  }

  function buildDecisionLog(record, context = {}) {
    const parts = [
      `分数${record.score}，收藏线${config.threshold}，复核线${REVIEW_THRESHOLD}`,
      `硬排除:${context.blocked ? "是" : "否"}`
    ];
    if (context.blockReason) parts.push(context.blockReason);
    if (record.action === "favorite") {
      parts.push(`达到收藏线，已点击收藏成功:${record.favoriteResult || "已收藏"}`);
    } else if (record.action === "favorite_failed") {
      parts.push(`达到收藏线，但收藏未确认:${record.favoriteResult || "未知"}`);
    } else if (record.action === "review") {
      parts.push(context.reviewReason || "未自动收藏，进入待复核");
    } else if (record.action === "exclude") {
      parts.push(context.excludeReason || "低于复核线或命中排除，未收藏");
    }
    const mainReason = record.mainReason || mainReasonFor(record);
    if (mainReason) parts.push(`主因:${mainReason}`);
    if ((record.reviewNotes || []).length) parts.push(`复核:${record.reviewNotes.slice(0, 2).join("、")}`);
    return parts.join("；");
  }

  function persistRecord(record) {
    const processingStatus = record.processingStatus || actionLabel(record.action);
    const recommendedAction = record.recommendedAction || recommendedActionFor(record);
    const needsReview = Boolean(record.needsReview || record.action === "review" || record.action === "favorite_failed");
    const mainReason = record.mainReason || mainReasonFor(record);
    const saved = {
      time: record.time,
      query: currentCampaignKeywordLabel(),
      result: actionLabel(record.action),
      processingStatus,
      recommendedAction,
      needsReview: needsReview ? "是" : "否",
      mainReason,
      ruleVersion: record.ruleVersion || RULE_VERSION,
      score: record.score,
      title: record.title,
      companyScale: record.companyScale || currentCompanyScaleLabel(),
      cardText: norm(record.cardText || "").slice(0, 260),
      hits: (record.hits || []).join("、"),
      negatives: (record.negatives || []).join("、"),
      filterNotes: (record.filterNotes || []).join("、"),
      reviewNotes: (record.reviewNotes || []).join("、"),
      decisionLog: record.decisionLog || "",
      detailMatched: record.detailMatched || "",
      detailChanged: record.detailChanged || "",
      detailHrefMatched: record.detailHrefMatched || "",
      favoriteResult: record.favoriteResult || "",
      favoriteButtonText: record.favoriteButtonText || "",
      greetingResult: record.greetingResult || "",
      href: record.href
    };
    const index = state.records.findIndex(r => r.href === saved.href);
    if (index >= 0) {
      state.records[index] = saved;
    } else {
      state.records.push(saved);
    }
    state.records = state.records.slice(-1200);
    saveRecords();
  }

  const TABLE_HEADERS = ["时间", "搜索词", "结果", "处理状态", "推荐动作", "是否需要人工看", "主要原因", "规则版本", "分数", "岗位", "公司规模", "岗位卡片", "命中关键词", "扣分关键词", "筛选备注", "复核建议", "决策日志", "详情匹配", "详情已切换", "详情链接匹配", "收藏状态", "收藏按钮文本", "打招呼状态", "链接"];

  function tableRow(record) {
    return [
      record.time,
      record.query,
      record.result,
      record.processingStatus || record.result,
      record.recommendedAction || "",
      record.needsReview || "",
      record.mainReason || "",
      record.ruleVersion || "",
      record.score,
      record.title,
      record.companyScale || "",
      record.cardText,
      record.hits,
      record.negatives,
      record.filterNotes,
      record.reviewNotes,
      record.decisionLog,
      record.detailMatched,
      record.detailChanged,
      record.detailHrefMatched,
      record.favoriteResult,
      record.favoriteButtonText,
      record.greetingResult || "",
      record.href
    ];
  }

  function tableText() {
    const clean = value => String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
    const rows = state.records.map(record => tableRow(record).map(clean).join("\t"));
    return [TABLE_HEADERS.join("\t"), ...rows].join("\n");
  }

  function recordsJson() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      ruleVersion: RULE_VERSION,
      config: configSchemaSnapshot(),
      records: state.records
    }, null, 2);
  }

  function recordStatus(record) {
    const value = String(record?.result || record?.action || "");
    if (value === "favorite" || value.includes("已收藏")) return "favorite";
    if (value === "favorite_failed" || value.includes("收藏失败")) return "favorite_failed";
    if (value === "review" || value.includes("待复核")) return "review";
    if (value === "exclude" || value.includes("已排除")) return "exclude";
    return "all";
  }

  function logStatus(record) {
    if (!record) return "all";
    if (record.action === "favorite") return "favorite";
    if (record.action === "favorite_failed") return "favorite_failed";
    if (record.action === "review") return "review";
    if (record.action === "exclude") return "exclude";
    if (!record.action) return recordStatus(record);
    return "all";
  }

  function recordToLogItem(record) {
    const status = recordStatus(record);
    const action = status === "favorite"
      ? "favorite"
      : status === "favorite_failed"
        ? "favorite_failed"
        : status === "review"
          ? "review"
          : status === "exclude"
            ? "exclude"
            : "skip";
    return {
      time: record.time,
      title: record.title || record.href || "未命名岗位",
      href: record.href,
      cardText: record.cardText || "",
      score: Number(record.score || 0),
      hits: parseKeywordList(record.hits || ""),
      negatives: parseKeywordList(record.negatives || ""),
      filterNotes: parseKeywordList(record.filterNotes || ""),
      reviewNotes: parseKeywordList(record.reviewNotes || ""),
      action,
      mainReason: record.mainReason || "",
      decisionLog: record.decisionLog || "",
      favoriteResult: record.favoriteResult || "",
      favoriteButtonText: record.favoriteButtonText || "",
      greetingResult: record.greetingResult || "",
      fromRecord: true
    };
  }

  function recentDecisionItems() {
    const items = [];
    const seen = new Set();
    for (const item of state.logs) {
      const key = item.href || `${item.time || ""}:${item.title || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    for (const record of state.records.slice().reverse()) {
      const key = record.href || `${record.time || ""}:${record.title || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(recordToLogItem(record));
      if (items.length >= 160) break;
    }
    return items;
  }

  function recordsByStatus(status) {
    if (!status || status === "all") return state.records.slice();
    return state.records.filter(record => recordStatus(record) === status);
  }

  function recordsJsonFor(records, label = "all") {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      label,
      ruleVersion: RULE_VERSION,
      config: configSchemaSnapshot(),
      records
    }, null, 2);
  }

  function linksTextFor(records) {
    return records
      .map(record => record.href)
      .filter(Boolean)
      .join("\n");
  }

  function pageLinksText() {
    return getJobLinks()
      .map(job => job.href)
      .filter(Boolean)
      .join("\n");
  }

  async function copyToClipboard(text, message) {
    await navigator.clipboard.writeText(text || "");
    updateStatus(statusSummary(message));
  }

  function favoriteFailureRecords() {
    return recordsByStatus("favorite_failed");
  }

  function recentFavoriteFailure() {
    return favoriteFailureRecords().slice().reverse()[0] || null;
  }

  function openRecentFavoriteFailure() {
    const record = recentFavoriteFailure();
    if (!record?.href) {
      updateStatus(statusSummary("最近没有收藏失败记录。"));
      return;
    }
    window.open(record.href, "_blank", "noopener,noreferrer");
    updateStatus(statusSummary(`已打开最近收藏失败：${record.title || record.href}`));
  }

  function clearFavoriteFailures() {
    const before = state.records.length;
    state.records = state.records.filter(record => recordStatus(record) !== "favorite_failed");
    saveRecords();
    updatePanel();
    updateStatus(statusSummary(`已清空收藏失败记录 ${before - state.records.length} 条。`));
  }

  function backToSearchList() {
    const url = new URL(location.href);
    url.pathname = "/web/geek/jobs";
    location.href = url.toString();
  }

  function tableTextFor(records) {
    const clean = value => String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
    const rows = records.map(record => tableRow(record).map(clean).join("\t"));
    return [TABLE_HEADERS.join("\t"), ...rows].join("\n");
  }

  function safeNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
    const number = Number(value);
    const next = Number.isFinite(number) ? number : fallback;
    return Math.min(max, Math.max(min, next));
  }

  function readThresholdInput() {
    const input = document.querySelector("#baf-threshold");
    const raw = String(input?.value ?? "").trim();
    if (raw === "") return config.threshold;
    return safeNumber(raw, config.threshold, REVIEW_THRESHOLD + 1, 100);
  }

  function normalizeThresholdInput() {
    const next = readThresholdInput();
    config.threshold = next;
    setPanelValue("#baf-threshold", next);
    readPanelConfig();
  }

  function readPanelConfig() {
    config.threshold = readThresholdInput();
    config.maxJobs = safeNumber(document.querySelector("#baf-max")?.value, config.maxJobs, 1);
    config.filters.jobNature = norm(document.querySelector("#baf-job-nature")?.value || "");
    config.filters.targetKeywords = parseKeywordList(document.querySelector("#baf-target-keywords")?.value || "");
    config.filters.salaryMin = norm(document.querySelector("#baf-salary-min")?.value || "");
    config.filters.salaryMax = norm(document.querySelector("#baf-salary-max")?.value || "");
    config.filters.customPositive = parseKeywordList(document.querySelector("#baf-positive")?.value || "");
    config.filters.customNegative = parseKeywordList(document.querySelector("#baf-negative")?.value || "");
    config.filters.skipRecorded = Boolean(document.querySelector("#baf-skip-recorded")?.checked);
    config.safety.dailyScanLimit = safeNumber(document.querySelector("#baf-daily-scan-limit")?.value, config.safety.dailyScanLimit, 0);
    config.safety.dailyFavoriteLimit = safeNumber(document.querySelector("#baf-daily-favorite-limit")?.value, config.safety.dailyFavoriteLimit, 0);
    config.safety.pauseEvery = safeNumber(document.querySelector("#baf-pause-every")?.value, config.safety.pauseEvery, 0);
    config.safety.pauseMinSec = safeNumber(document.querySelector("#baf-pause-min")?.value, config.safety.pauseMinSec, 0);
    config.safety.pauseMaxSec = safeNumber(document.querySelector("#baf-pause-max")?.value, config.safety.pauseMaxSec, 0);
    config.localAi.queryInfo = Boolean(document.querySelector("#baf-local-ai-info")?.checked);
    config.greeting.enabled = Boolean(document.querySelector("#baf-auto-greet")?.checked);
    config.greeting.dailyLimit = safeNumber(document.querySelector("#baf-greet-limit")?.value, config.greeting.dailyLimit, 0);
    config.greeting.minScore = safeNumber(document.querySelector("#baf-greet-min-score")?.value, config.greeting.minScore || config.threshold, REVIEW_THRESHOLD + 1, 100);
    config.greeting.template = String(document.querySelector("#baf-greet-template")?.value || config.greeting.template || "").trim();
    const keyInputEl = document.querySelector("#baf-ai-key");
    const keyInputValue = String(keyInputEl?.value || "").trim();
    if (keyInputValue && !isMaskedApiKey(keyInputValue)) state.aiSettings.apiKey = keyInputValue;
    state.aiSettings.model = String(document.querySelector("#baf-ai-model")?.value || state.aiSettings.model || "deepseek-v4-flash").trim();
    state.settings = panelSettingsSnapshot();
    saveSettings(state.settings);
    updateConfigSummary();
  }

  function schedulePanelSettingsSave() {
    if (state.settingsTimer) window.clearTimeout(state.settingsTimer);
    state.settingsTimer = window.setTimeout(() => {
      readPanelConfig();
      state.settingsTimer = null;
    }, 400);
  }

  function panelSettingsSnapshot() {
    return {
      version: SETTINGS_VERSION,
      threshold: config.threshold,
      reviewThreshold: REVIEW_THRESHOLD,
      ruleVersion: RULE_VERSION,
      maxJobs: config.maxJobs,
      filters: {
        jobNature: config.filters.jobNature,
        targetKeywords: [...(config.filters.targetKeywords || [])],
        salaryMin: config.filters.salaryMin,
        salaryMax: config.filters.salaryMax,
        customPositive: [...config.filters.customPositive],
        customNegative: [...config.filters.customNegative],
        skipRecorded: config.filters.skipRecorded
      },
      safety: {
        dailyScanLimit: config.safety.dailyScanLimit,
        dailyFavoriteLimit: config.safety.dailyFavoriteLimit,
        pauseEvery: config.safety.pauseEvery,
        pauseMinSec: config.safety.pauseMinSec,
        pauseMaxSec: config.safety.pauseMaxSec
      },
      localAi: {
        queryInfo: Boolean(config.localAi.queryInfo)
      },
      greeting: {
        enabled: Boolean(config.greeting.enabled),
        minScore: safeNumber(config.greeting.minScore, config.threshold, REVIEW_THRESHOLD + 1, 100),
        dailyLimit: Number(config.greeting.dailyLimit || 0),
        template: config.greeting.template || ""
      },
      search: {
        keywords: document.querySelector("#baf-keywords")?.value || "",
        includeRecommendation: Boolean(document.querySelector("#baf-include-blank")?.checked),
        expandKeywords: Boolean(document.querySelector("#baf-expand-keywords")?.checked),
        perKeywordMax: safeNumber(document.querySelector("#baf-per-keyword")?.value, DEFAULT_PER_KEYWORD_MAX, 1)
      }
    };
  }

  function strategyProfileKey() {
    const profile = keywordProfileFromPanel();
    const salaryMin = norm(document.querySelector("#baf-salary-min")?.value || config.filters.salaryMin || "");
    const salaryMax = norm(document.querySelector("#baf-salary-max")?.value || config.filters.salaryMax || "");
    return JSON.stringify({
      jobNature: profile.natureText || config.filters.jobNature || "",
      normalizedNature: profile.nature,
      targetDirections: profile.targets,
      salaryMin,
      salaryMax,
      threshold: Number(config.threshold || 60),
      reviewThreshold: REVIEW_THRESHOLD
    });
  }

  function activeAiStrategy() {
    if (!state.aiStrategy) return null;
    if (state.aiStrategy.ruleVersion !== RULE_VERSION) return null;
    return state.aiStrategy.profileKey === strategyProfileKey() ? state.aiStrategy : null;
  }

  function screeningStrategySnapshot() {
    const targetWords = activeTargetKeywords();
    const nature = resolveJobNature(config.filters.jobNature || "");
    const natureLabel = jobNatureDisplayValue(config.filters.jobNature) || "不限";
    const directions = targetWords.length ? targetWords : [];
    const usefulDirections = directions.filter(word => !isBroadTargetKeyword(word));
    const broadDirections = directions.filter(isBroadTargetKeyword);
    const targetPositive = [];
    for (const target of directions) {
      if (!target) continue;
      targetPositive.push(target);
      if (nature === "sales") targetPositive.push(`${target}销售`, `${target}商务`, `${target}大客户`);
      if (nature === "customer_success") targetPositive.push(`${target}客户成功`, `${target}客户运营`, `${target}续费`);
      if (nature === "presales") targetPositive.push(`${target}售前`, `${target}解决方案`, `${target}方案顾问`);
      if (nature === "operations") targetPositive.push(`${target}运营`, `${target}增长`, `${target}用户运营`);
      if (nature === "product") targetPositive.push(`${target}产品`, `${target}产品经理`, `${target}产品运营`);
      if (nature === "tech") targetPositive.push(`${target}工程师`, `${target}开发`, `${target}技术支持`);
    }
    const rolePositive = {
      sales: ["销售", "BD", "商务", "大客户", "客户经理", "客户开发", "商务谈判"],
      customer_success: ["客户成功", "客户运营", "交付", "培训", "续费", "续签", "复购"],
      presales: ["售前", "解决方案", "方案顾问", "POC", "产品演示", "需求调研"],
      operations: ["运营", "增长运营", "客户运营", "商家运营", "数据运营", "活动运营"],
      product: ["产品经理", "产品运营", "需求分析", "产品规划", "原型"],
      tech: ["工程师", "开发", "研发", "架构", "技术支持", "技术方案"]
    }[nature] || [];
    const positive = [...new Set([...(config.filters.customPositive || []), ...targetPositive, ...rolePositive])];
    const directExclude = filterConflictingNegativeWords(config.filters.customNegative || [], { keepManual: true });
    const systemExclude = filterConflictingNegativeWords([...(config.negative.hard || []), ...(config.negative.soft || [])]);
    const localStrategy = {
      target: {
        jobNature: natureLabel,
        normalizedNature: nature,
        directions,
        usefulDirections,
        broadDirections
      },
      mustHave: [
        `岗位性质必须匹配：${natureLabel}`,
        usefulDirections.length
          ? `必须命中具体目标方向：${usefulDirections.slice(0, 8).join("、")}`
          : "目标方向暂时偏泛，只能进入复核，不能直接强收藏"
      ],
      acceptable: [
        "岗位性质相近，并且命中目标场景的岗位可以进入待复核",
        "标题不完全命中，但职责里有明确业务场景的岗位可以进入待复核"
      ],
      reviewOnly: [
        "目标方向相关但岗位性质不完全匹配",
        "行业相关但标题不够明确"
      ],
      directExclude: [...new Set(directExclude)].slice(0, 40),
      systemExclude: [...new Set(systemExclude)].slice(0, 60),
      scoring: {
        favoriteScore: Number(config.threshold || 60),
        reviewScore: REVIEW_THRESHOLD,
        excludeBelow: REVIEW_THRESHOLD,
        broadTargetPolicy: "目标方向只有 ai、互联网、软件、SaaS、CRM 等泛词时，不直接强收藏，优先进入待复核"
      },
      salary: {
        minK: config.filters.salaryMin || "",
        maxK: config.filters.salaryMax || ""
      },
      positiveReference: positive.slice(0, 40),
      generatedBy: "local",
      safety: {
        dailyScanLimit: Number(config.safety.dailyScanLimit || 0),
        dailyFavoriteLimit: Number(config.safety.dailyFavoriteLimit || 0),
        pauseEvery: Number(config.safety.pauseEvery || 0),
        pauseRangeSec: [Number(config.safety.pauseMinSec || 0), Number(config.safety.pauseMaxSec || 0)]
      },
      boundary: "只做岗位粗筛、收藏、记录和复核；默认不自动打招呼，只有开启后才在收藏成功后尝试；不自动投递、不读取聊天"
    };
    const aiStrategy = activeAiStrategy();
    if (!aiStrategy?.strategy) return localStrategy;
    const merged = {
      ...localStrategy,
      ...aiStrategy.strategy,
      target: {
        ...localStrategy.target,
        ...(aiStrategy.strategy.target || {})
      },
      scoring: {
        ...localStrategy.scoring,
        ...(aiStrategy.strategy.scoring || {})
      },
      salary: {
        ...localStrategy.salary,
        ...(aiStrategy.strategy.salary || {})
      },
      safety: {
        ...localStrategy.safety,
        ...(aiStrategy.strategy.safety || {})
      },
      generatedBy: "deepseek",
      generatedAt: aiStrategy.createdAt
    };
    return {
      ...merged,
      directExclude: filterConflictingNegativeWords(sanitizeAiWords(merged.directExclude || [], 80)),
      positiveReference: sanitizePositiveWordsByNature(merged.positiveReference || [], 80)
    };
  }

  function configSchemaSnapshot() {
    const strategy = screeningStrategySnapshot();
    const targetWords = activeTargetKeywords();
    const nature = resolveJobNature(config.filters.jobNature || "");
    const positive = [...new Set([...(config.filters.customPositive || []), ...config.positive.high, ...config.positive.medium])];
    const customNegative = filterConflictingNegativeWords(config.filters.customNegative || [], { keepManual: true });
    const systemNegative = filterConflictingNegativeWords([...(config.negative.hard || []), ...(config.negative.soft || [])]);
    return {
      product: "BOSS岗位粗筛助手",
      mode: "low_risk_rough_screen",
      boundary: "只做岗位粗筛、收藏、记录和复核；默认不自动打招呼，只有开启后才在收藏成功后尝试；不自动投递、不读取聊天",
      ruleVersion: RULE_VERSION,
      target: {
        jobNature: jobNatureDisplayValue(config.filters.jobNature) || "不限",
        normalizedNature: nature,
        directions: targetWords
      },
      thresholds: {
        favoriteScore: Number(config.threshold || 60),
        reviewScore: REVIEW_THRESHOLD,
        excludeBelow: REVIEW_THRESHOLD
      },
      salary: {
        minK: config.filters.salaryMin || "",
        maxK: config.filters.salaryMax || ""
      },
      keywords: {
        positive: positive.slice(0, 80),
        negative: customNegative.slice(0, 80),
        systemNegative: systemNegative.slice(0, 80),
        search: parseKeywordList(document.querySelector("#baf-keywords")?.value || "")
      },
      screeningStrategy: strategy,
      userPreferences: {
        likedWords: [...(state.userPrefs.likedWords || [])],
        dislikedWords: [...(state.userPrefs.dislikedWords || [])]
      },
      ai: {
        provider: "deepseek",
        enabled: Boolean(state.aiSettings.hasKey),
        model: state.aiSettings.model || "deepseek-v4-flash"
      },
      safety: {
        dailyScanLimit: Number(config.safety.dailyScanLimit || 0),
        dailyFavoriteLimit: Number(config.safety.dailyFavoriteLimit || 0),
        pauseEvery: Number(config.safety.pauseEvery || 0),
        pauseRangeSec: [Number(config.safety.pauseMinSec || 0), Number(config.safety.pauseMaxSec || 0)]
      },
      outputStatuses: ["已收藏", "待复核", "已排除", "收藏失败", "用户想看", "用户不想看"]
    };
  }

  function configSummaryText() {
    const aiStrategy = activeAiStrategy();
    if (aiStrategy?.summaryText) return aiStrategy.summaryText;
    const snapshot = configSchemaSnapshot();
    const strategy = snapshot.screeningStrategy;
    const directions = snapshot.target.directions.slice(0, 6).join("、") || "未填写";
    const positive = strategy.positiveReference.slice(0, RULE_SEED_LIMIT).join("、") || "按岗位性质和目标方向自动加分";
    const negative = strategy.directExclude.slice(0, RULE_SEED_LIMIT).join("、") || "待生成规则后由 DeepSeek 分析；当前仅使用底层通用安全过滤";
    return [
      `配置来源：本地预览，点击“生成搜索词”后会由 DeepSeek 重算。`,
      `我要找：${snapshot.target.jobNature} + ${directions}`,
      `必须满足：${strategy.mustHave.join("；")}。`,
      `可以接受：${strategy.acceptable.join("；")}。`,
      `待复核：${(strategy.reviewOnly || []).slice(0, 4).join("；") || "边界岗位人工确认"}。`,
      `直接排除：${negative}`,
      `收藏策略：${strategy.scoring.favoriteScore}分以上收藏，${strategy.scoring.reviewScore}-${strategy.scoring.favoriteScore - 1}分待复核，低于${strategy.scoring.reviewScore}分跳过。`,
      `加分参考：${positive}`,
      `安全限制：今日最多扫${strategy.safety.dailyScanLimit || "不限"}，今日最多藏${strategy.safety.dailyFavoriteLimit || "不限"}，每扫${strategy.safety.pauseEvery}个休息${strategy.safety.pauseRangeSec[0]}-${strategy.safety.pauseRangeSec[1]}秒。`,
      `使用边界：${strategy.boundary}；遇到验证或账号异常立即停止。`
    ].join("\n");
  }

  function updateConfigSummary() {
    const el = document.querySelector("#baf-config-summary");
    if (!el) return;
    const text = configSummaryText();
    el.textContent = text;
  }

  function applySavedPanelSettings(settings) {
    if (!settings) return;
    config.threshold = Number(settings.threshold || config.threshold);
    config.maxJobs = Number(settings.maxJobs || config.maxJobs);
    config.filters = {
      ...config.filters,
      ...(settings.filters || {}),
      targetKeywords: [...(settings.filters?.targetKeywords || config.filters.targetKeywords || DEFAULT_TARGET_KEYWORDS)],
      customPositive: [...(settings.filters?.customPositive || [])],
      customNegative: [...(settings.filters?.customNegative || [])]
    };
    config.safety = {
      ...config.safety,
      ...(settings.safety || {})
    };
    config.localAi = {
      ...config.localAi,
      ...(settings.localAi || {})
    };
    config.greeting = {
      ...config.greeting,
      ...(settings.greeting || {})
    };
  }

  function setPanelValue(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.value = value ?? "";
  }

  function setPanelChecked(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.checked = Boolean(value);
  }

  function hydratePanelFromSettings(settings) {
    if (!settings) return;
    applySavedPanelSettings(settings);
    setPanelValue("#baf-threshold", config.threshold);
    setPanelValue("#baf-max", config.maxJobs);
    setPanelValue("#baf-job-nature", jobNatureDisplayValue(config.filters.jobNature));
    setPanelValue("#baf-target-keywords", (config.filters.targetKeywords?.length ? config.filters.targetKeywords : DEFAULT_TARGET_KEYWORDS).join("，"));
    setPanelValue("#baf-salary-min", config.filters.salaryMin);
    setPanelValue("#baf-salary-max", config.filters.salaryMax);
    setPanelValue("#baf-positive", (config.filters.customPositive || []).join("\n"));
    setPanelValue("#baf-negative", (config.filters.customNegative || []).join("\n"));
    setPanelChecked("#baf-skip-recorded", config.filters.skipRecorded);
    setPanelValue("#baf-daily-scan-limit", config.safety.dailyScanLimit);
    setPanelValue("#baf-daily-favorite-limit", config.safety.dailyFavoriteLimit);
    setPanelValue("#baf-pause-every", config.safety.pauseEvery);
    setPanelValue("#baf-pause-min", config.safety.pauseMinSec);
    setPanelValue("#baf-pause-max", config.safety.pauseMaxSec);
    setPanelChecked("#baf-local-ai-info", config.localAi.queryInfo);
    setPanelChecked("#baf-auto-greet", config.greeting.enabled);
    setPanelValue("#baf-greet-min-score", config.greeting.minScore || config.threshold);
    setPanelValue("#baf-greet-limit", config.greeting.dailyLimit);
    setPanelValue("#baf-greet-template", config.greeting.template);
    setPanelValue("#baf-ai-model", state.aiSettings.model || "deepseek-v4-flash");
    setPanelValue("#baf-keywords", settings.search?.keywords || currentSearchKeyword());
    setPanelChecked("#baf-include-blank", settings.search?.includeRecommendation ?? true);
    setPanelChecked("#baf-expand-keywords", settings.search?.expandKeywords ?? true);
    setPanelValue("#baf-per-keyword", settings.search?.perKeywordMax || DEFAULT_PER_KEYWORD_MAX);
  }

  function campaignSearchKeywordsText() {
    const stored = String(state.campaign?.settings?.search?.keywords || "");
    const fallback = (state.campaign?.keywords || []).filter(Boolean).join("\n");
    const greetingTemplate = norm(state.campaign?.settings?.greeting?.template || config.greeting?.template || "");
    if (stored && greetingTemplate && norm(stored) === greetingTemplate) return fallback;
    return stored || fallback;
  }

  function safetyStopReason() {
    saveDailyStats();
    const pageText = pageTextWithoutAssistantPanel();
    if (/验证码|安全验证|登录异常|账号异常|访问过于频繁|请完成验证|滑块/.test(pageText)) {
      return "检测到验证码、登录异常或风控提示，已停止任务，请人工处理。";
    }
    const scanLimit = Number(config.safety.dailyScanLimit || 0);
    const favoriteLimit = Number(config.safety.dailyFavoriteLimit || 0);
    if (scanLimit > 0 && state.daily.scanned >= scanLimit) {
      return `达到今日扫描安全上限 ${scanLimit}`;
    }
    if (favoriteLimit > 0 && state.daily.favorited >= favoriteLimit) {
      return `达到今日收藏安全上限 ${favoriteLimit}`;
    }
    const greetLimit = Number(config.greeting?.dailyLimit || 0);
    if (config.greeting?.enabled && greetLimit > 0 && state.daily.greeted >= greetLimit) {
      return `达到今日打招呼安全上限 ${greetLimit}`;
    }
    return "";
  }

  function pageTextWithoutAssistantPanel() {
    const clone = document.body?.cloneNode(true);
    if (!clone) return "";
    clone.querySelector("#boss-ai-autofav-panel")?.remove();
    clone.querySelector("#baf-feedback")?.remove();
    return norm(clone.innerText || clone.textContent || "");
  }

  function favoriteLimitReached() {
    saveDailyStats();
    const limit = Number(config.safety.dailyFavoriteLimit || 0);
    return limit > 0 && state.daily.favorited >= limit;
  }

  function campaignProgressLabel() {
    if (state.campaign?.paused) {
      const total = state.campaign.keywords?.length || 0;
      const index = Math.min((state.campaign.index || 0) + 1, total || 1);
      const keyword = keywordLabel(keywordFromCampaign());
      const scanned = Number(state.campaign.keywordScanned || 0);
      const limit = Number(state.campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX);
      return `多词任务已暂停 ${index}/${total}｜当前：${keyword}｜本词 ${scanned}/${limit}`;
    }
    if (!state.campaign?.active) return "当前列表｜不会自动换关键词";
    const total = state.campaign.keywords?.length || 0;
    const index = Math.min((state.campaign.index || 0) + 1, total || 1);
    const keyword = keywordLabel(keywordFromCampaign());
    const scanned = Number(state.campaign.keywordScanned || 0);
    const limit = Number(state.campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX);
    const totalTarget = total * limit;
    const totalScanned = Number(state.campaign.totalScanned ?? ((index - 1) * limit + scanned));
    return `多词任务 ${index}/${total}｜当前：${keyword}｜本词 ${scanned}/${limit}｜总进度 ${totalScanned}/${totalTarget}`;
  }

  function statusSummary(prefix = "") {
    const mode = state.campaign?.active
      ? "多词任务"
      : state.campaign?.paused
        ? "多词已暂停"
      : "当前列表";
    const progress = campaignProgressLabel();
    const stats = [
      `本次 ${state.scanned}`,
      `藏 ${state.favorited}`,
      `复 ${state.reviewed}`,
      `跳 ${state.skipped}`,
      `错 ${state.errors}`,
      `今日扫 ${state.daily.scanned}/${config.safety.dailyScanLimit || "不限"}`,
      `今日藏 ${state.daily.favorited}/${config.safety.dailyFavoriteLimit || "不限"}`,
      `今日招呼 ${state.daily.greeted || 0}/${config.greeting?.dailyLimit || "不限"}`,
      `表 ${state.records.length}`
    ].join("｜");
    return [prefix, `${mode}｜${progress}`, stats].filter(Boolean).join("\n");
  }

  function todayProgressText() {
    const scanLimit = Number(config.safety?.dailyScanLimit || 0);
    const favoriteLimit = Number(config.safety?.dailyFavoriteLimit || 0);
    const greetLimit = Number(config.greeting?.dailyLimit || 0);
    const scanText = scanLimit > 0 ? `${state.daily.scanned}/${scanLimit}` : `${state.daily.scanned}/不限`;
    const favoriteText = favoriteLimit > 0 ? `${state.daily.favorited}/${favoriteLimit}` : `${state.daily.favorited}/不限`;
    const greetText = greetLimit > 0 ? `${state.daily.greeted || 0}/${greetLimit}` : `${state.daily.greeted || 0}/不限`;
    return `今日 ${todayKey()}  扫 ${scanText}  藏 ${favoriteText}  招呼 ${greetText}`;
  }

  function updateTodayProgress() {
    const el = document.querySelector("#baf-today-progress");
    if (el) el.textContent = todayProgressText();
  }

  function resetDailyProgress() {
    state.daily = { date: todayKey(), scanned: 0, favorited: 0, greeted: 0 };
    saveDailyStats();
    updateTodayProgress();
    updatePanel();
      updateStatus(statusSummary("今日进度已重置。"));
  }

  function debugLog(event, data = {}) {
    const campaign = state.campaign || null;
    const entry = {
      time: new Date().toISOString(),
      event,
      url: location.href,
      running: state.running,
      mode: campaign?.active ? "task" : campaign?.paused ? "paused" : "current",
      keyword: campaign ? keywordLabel(keywordFromCampaign()) : currentQueryLabel(),
      campaign: campaign ? {
        active: Boolean(campaign.active),
        paused: Boolean(campaign.paused),
        index: Number(campaign.index || 0),
        total: Number(campaign.keywords?.length || 0),
        keywordScanned: Number(campaign.keywordScanned || 0),
        totalScanned: Number(campaign.totalScanned || 0),
        perKeywordMax: Number(campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX)
      } : null,
      counters: {
        scanned: state.scanned,
        favorited: state.favorited,
        reviewed: state.reviewed,
        skipped: state.skipped,
        errors: state.errors,
        dailyScanned: state.daily.scanned,
        dailyFavorited: state.daily.favorited,
        records: state.records.length
      },
      data
    };
    state.debugLogs.push(entry);
    state.debugLogs = state.debugLogs.slice(-400);
    saveDebugLogs();
    updateRuntimeLogPreview(entry);
  }

  function updateRuntimeLogPreview(entry = state.debugLogs[state.debugLogs.length - 1]) {
    const el = document.querySelector("#baf-last-runtime-log");
    if (!el || !entry) return;
    const keyword = entry.keyword ? `｜${entry.keyword}` : "";
    el.textContent = `运行日志：${entry.event}${keyword}｜${new Date(entry.time).toLocaleTimeString()}`;
  }

  function diagnosticsJson() {
    const configSnapshot = (() => {
      try {
        readPanelConfig();
        return configSchemaSnapshot();
      } catch (error) {
        return { error: String(error?.message || error) };
      }
    })();
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      product: "BOSS岗位粗筛助手",
      ruleVersion: RULE_VERSION,
      url: location.href,
      userAgent: navigator.userAgent,
      status: statusSummary(),
      config: configSnapshot,
      campaign: state.campaign ? {
        active: Boolean(state.campaign.active),
        paused: Boolean(state.campaign.paused),
        index: Number(state.campaign.index || 0),
        keywords: state.campaign.keywords || [],
        keywordScanned: Number(state.campaign.keywordScanned || 0),
        totalScanned: Number(state.campaign.totalScanned || 0),
        perKeywordMax: Number(state.campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX),
        startedAt: state.campaign.startedAt || null
      } : null,
      counters: {
        scanned: state.scanned,
        favorited: state.favorited,
        reviewed: state.reviewed,
        skipped: state.skipped,
        errors: state.errors,
        daily: state.daily
      },
      recentRuntimeLogs: state.debugLogs.slice(-160),
      recentJobLogs: state.logs.slice(0, 60),
      recentRecords: state.records.slice(-60)
    }, null, 2);
  }

  function runtimeLogText(limit = 120) {
    const logs = state.debugLogs.slice(-limit);
    if (!logs.length) return "暂无运行日志。";
    return logs.map(item => {
      const campaign = item.campaign
        ? `kw=${item.keyword} idx=${Number(item.campaign.index || 0) + 1}/${item.campaign.total || 0} scanned=${item.campaign.keywordScanned || 0}/${item.campaign.perKeywordMax || 0}`
        : `kw=${item.keyword}`;
      const data = item.data && Object.keys(item.data).length ? ` data=${JSON.stringify(item.data)}` : "";
      return `[${item.time}] ${item.event} running=${item.running} mode=${item.mode} ${campaign}${data}`;
    }).join("\n");
  }

  async function waitWithCountdown(seconds, label) {
    const total = Math.max(0, Number(seconds || 0));
    for (let left = total; left > 0; left -= 1) {
      if (!state.running && !state.campaign?.active) break;
      updateStatus(statusSummary(`${label}，剩余 ${left} 秒`));
      await sleep(1000);
    }
  }

  function readCampaignConfig() {
    const keywords = parseSearchKeywords();
    return {
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      active: true,
      paused: false,
      phase: "prepare_keyword",
      currentKeyword: keywords[0] || "",
      keywordSearchStatus: "pending",
      keywordListSignature: "",
      keywordError: "",
      keywords,
      index: 0,
      perKeywordMax: safeNumber(document.querySelector("#baf-per-keyword")?.value, DEFAULT_PER_KEYWORD_MAX, 1),
      keywordScanned: 0,
      totalScanned: 0,
      restMinSec: safeNumber(config.safety.pauseMinSec, 0, 0),
      restMaxSec: safeNumber(config.safety.pauseMaxSec, config.safety.pauseMinSec || 0, 0),
      settings: panelSettingsSnapshot(),
      startedAt: Date.now()
    };
  }

  function sameKeywordList(a = [], b = []) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
  }

  function resetRunCounters() {
    state.scanned = 0;
    state.favorited = 0;
    state.reviewed = 0;
    state.skipped = 0;
    state.errors = 0;
    state.logs = [];
    state.processedThisRun = new Set();
  }

  function resumeOrCreateCampaign(options = {}) {
    const next = readCampaignConfig();
    if (options.resumePaused && state.campaign?.paused && sameKeywordList(state.campaign.keywords || [], next.keywords || [])) {
      state.campaign = {
        ...state.campaign,
        active: true,
        paused: false,
        phase: "prepare_keyword",
        currentKeyword: state.campaign.keywords?.[state.campaign.index] || "",
        keywordSearchStatus: "resuming",
        keywordError: "",
        perKeywordMax: next.perKeywordMax,
        restMinSec: next.restMinSec,
        restMaxSec: next.restMaxSec,
        settings: next.settings
      };
      saveCampaign();
      return { resumed: true };
    }
    state.campaign = next;
    saveCampaign();
    return { resumed: false };
  }

  function keywordFromCampaign() {
    return state.campaign?.keywords?.[state.campaign.index] ?? currentSearchKeyword();
  }

  function sameQueryKeyword(a, b) {
    return norm(a || "") === norm(b || "");
  }

  function navigateToKeyword(keyword) {
    const url = new URL(location.href);
    url.pathname = "/web/geek/jobs";
    const current = norm(url.searchParams.get("query") || "");
    const next = norm(keyword || "");
    if (current === next) return false;
    if (keyword) {
      url.searchParams.set("query", keyword);
    } else {
      url.searchParams.delete("query");
    }
    location.href = url.toString();
    return true;
  }

  function getPageQueryState() {
    const input = pageSearchInputs()[0];
    return {
      urlKeyword: currentSearchKeyword(),
      inputKeyword: norm(input?.el?.value || ""),
      listSignature: jobListSignature(),
      visibleJobCount: getJobLinks().length
    };
  }

  function pageSearchInputs() {
    return Array.from(document.querySelectorAll("input,textarea"))
      .filter(el => !el.closest("#boss-ai-autofav-panel"))
      .map(el => {
        const r = el.getBoundingClientRect();
        const hint = norm([
          el.getAttribute("placeholder"),
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
          el.name,
          el.id,
          el.className
        ].filter(Boolean).join(" "));
        return { el, r, hint };
      })
      .filter(x =>
        x.r.width > 120 &&
        x.r.height > 20 &&
        x.r.top >= 0 &&
        x.r.top < Math.max(220, window.innerHeight * 0.45) &&
        /搜索|职位|岗位|公司|query|keyword|search/.test(x.hint)
      )
      .sort((a, b) => a.r.top - b.r.top || b.r.width - a.r.width);
  }

  function pageSearchButtons() {
    return Array.from(document.querySelectorAll("button,a,[role='button']"))
      .filter(el => !el.closest("#boss-ai-autofav-panel"))
      .map(el => {
        const r = el.getBoundingClientRect();
        const text = norm(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title"));
        return { el, r, text };
      })
      .filter(x =>
        x.r.width > 20 &&
        x.r.height > 18 &&
        x.r.top >= 0 &&
        x.r.top < Math.max(240, window.innerHeight * 0.45) &&
        /搜索|搜职位|搜岗位/.test(x.text)
      )
      .sort((a, b) => a.r.top - b.r.top);
  }

  function setInputValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function searchKeywordOnPage(keyword) {
    const next = norm(keyword || "");
    const input = pageSearchInputs()[0];
    if (!input) return false;
    input.el.focus();
    setInputValue(input.el, next);
    await sleep(120);
    const button = pageSearchButtons()[0];
    if (button) {
      safeElementClick(button.el);
      return true;
    }
    input.el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    input.el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return true;
  }

  async function performKeywordSearch(keyword, beforeSignature = jobListSignature()) {
    if (sameQueryKeyword(keyword, currentSearchKeyword()) && beforeSignature) {
      return { method: "same", beforeSignature };
    }
    const searchedOnPage = await searchKeywordOnPage(keyword);
    if (searchedOnPage) return { method: "page_search", beforeSignature };
    const navigated = navigateToKeyword(keyword);
    return { method: navigated ? "navigation" : "same", beforeSignature };
  }

  function keywordResultMatches(keyword) {
    const next = norm(keyword || "");
    const stateNow = getPageQueryState();
    if (!next) {
      return !stateNow.urlKeyword;
    }
    return sameQueryKeyword(next, stateNow.urlKeyword) || sameQueryKeyword(next, stateNow.inputKeyword);
  }

  async function waitForKeywordResults(keyword, beforeSignature, beforeKeywordMatched = false, timeoutMs = 12000) {
    const next = norm(keyword || "");
    const started = Date.now();
    let lastSignature = "";
    let stableRounds = 0;
    while (Date.now() - started < timeoutMs) {
      if (!state.campaign?.active || state.campaign?.paused) {
        return { ok: false, reason: "campaign_stopped" };
      }
      const pageState = getPageQueryState();
      const signatureChanged = Boolean(pageState.listSignature && pageState.listSignature !== beforeSignature);
      const keywordMatches = next ? keywordResultMatches(next) : !pageState.urlKeyword;
      if (pageState.listSignature && pageState.listSignature === lastSignature) stableRounds += 1;
      else stableRounds = 0;
      lastSignature = pageState.listSignature;
      if (keywordMatches && pageState.visibleJobCount > 0 && (signatureChanged || !beforeSignature || (beforeKeywordMatched && stableRounds >= 2))) {
        return { ok: true, pageState, signatureChanged, stableRounds };
      }
      await sleep(350);
    }
    return { ok: false, reason: "timeout", pageState: getPageQueryState() };
  }

  async function ensureKeywordReady(keyword, reason = "keyword_switch") {
    const next = norm(keyword || "");
    const label = keywordLabel(next);
    const beforeSignature = jobListSignature();
    const beforeKeywordMatched = keywordResultMatches(next);
    debugLog(reason, { keyword: label, current: currentSearchKeyword(), beforeSignature });
    updateStatus(statusSummary(`正在搜索关键词：${label}`));
    if (state.campaign) {
      state.campaign.phase = "submit_search";
      state.campaign.currentKeyword = next;
      state.campaign.keywordSearchStatus = "submitting";
      state.campaign.keywordListSignature = beforeSignature;
      state.campaign.keywordError = "";
      saveCampaign();
    }
    const search = await performKeywordSearch(next, beforeSignature);
    if (search.method === "navigation") return "navigated";
    if (state.campaign) {
      state.campaign.phase = "wait_results";
      state.campaign.keywordSearchStatus = search.method;
      saveCampaign();
    }
    const ready = await waitForKeywordResults(next, beforeSignature, beforeKeywordMatched);
    if (!ready.ok) {
      if (state.campaign?.active) {
        state.campaign.active = false;
        state.campaign.paused = true;
        state.campaign.phase = "search_failed";
        state.campaign.keywordSearchStatus = "failed";
        state.campaign.keywordError = ready.reason;
        state.pausedByUserThisSession = true;
        saveCampaign();
      }
      debugLog("keyword_search_timeout", { keyword: label, reason: ready.reason, pageState: ready.pageState });
      updateStatus(statusSummary(`未确认“${label}”的搜索结果，已暂停，避免扫描旧列表。`));
      return "failed";
    }
    if (state.campaign) {
      state.campaign.phase = "scan_results";
      state.campaign.keywordSearchStatus = "ready";
      state.campaign.keywordListSignature = ready.pageState?.listSignature || "";
      state.campaign.keywordError = "";
      saveCampaign();
    }
    debugLog("keyword_results_ready", { keyword: label, ready });
    return search.method === "same" ? "same" : "searched_on_page";
  }

  async function switchToKeyword(keyword, reason = "keyword_switch") {
    return ensureKeywordReady(keyword, reason);
  }

  function randomRestMs() {
    const min = Number(state.campaign?.restMinSec || 0);
    const max = Number(state.campaign?.restMaxSec || min);
    const safeMax = Math.max(min, max);
    return (min + Math.random() * (safeMax - min)) * 1000;
  }

  function clearTimers() {
    if (state.autoTimer) {
      window.clearTimeout(state.autoTimer);
      state.autoTimer = null;
    }
    if (state.countdownTimer) {
      window.clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }

  function moveToNextKeyword() {
    if (!state.campaign?.active) return false;
    const fromKeyword = keywordLabel(keywordFromCampaign());
    state.campaign.index += 1;
    state.campaign.keywordScanned = 0;
    state.campaign.phase = "prepare_keyword";
    state.campaign.currentKeyword = state.campaign.keywords[state.campaign.index] || "";
    state.campaign.keywordSearchStatus = "pending";
    state.campaign.keywordError = "";
    if (state.campaign.index >= state.campaign.keywords.length) {
      state.campaign.active = false;
      state.campaign.paused = false;
      saveCampaign();
      debugLog("campaign_complete", { fromKeyword });
      showFeedbackPanel("多关键词任务已完成。");
      return false;
    }
    saveCampaign();
    const keyword = keywordFromCampaign();
    const rest = randomBetweenSec(KEYWORD_SWITCH_MIN_SEC, KEYWORD_SWITCH_MAX_SEC);
    let left = rest;
    clearTimers();
    debugLog("keyword_finished_waiting", { fromKeyword, nextKeyword: keywordLabel(keyword), restSec: rest });
    updateStatus(statusSummary(`\u5f53\u524d\u5173\u952e\u8bcd\u5b8c\u6210\uff0c${left} \u79d2\u540e\u5207\u6362\u5230\u4e0b\u4e00\u4e2a\u5173\u952e\u8bcd\uff1a${keywordLabel(keyword)}`));
    state.countdownTimer = window.setInterval(async () => {
      if (!state.campaign?.active || state.campaign?.paused) {
        if (state.countdownTimer) {
          window.clearInterval(state.countdownTimer);
          state.countdownTimer = null;
        }
        return;
      }
      left -= 1;
      if (left <= 0) {
        if (state.countdownTimer) {
          window.clearInterval(state.countdownTimer);
          state.countdownTimer = null;
        }
        const result = await switchToKeyword(keyword, "navigate_next_keyword");
        if (result !== "navigated" && state.campaign?.active && !state.campaign?.paused) {
          state.autoTimer = window.setTimeout(() => {
            if (!state.campaign?.active || state.campaign?.paused) return;
            start({ campaignMode: true, resumeCampaign: true });
          }, 500);
        }
        return;
      }
      updateStatus(statusSummary(`\u5f53\u524d\u5173\u952e\u8bcd\u5b8c\u6210\uff0c${left} \u79d2\u540e\u5207\u6362\u5230\u4e0b\u4e00\u4e2a\u5173\u952e\u8bcd\uff1a${keywordLabel(keyword)}`));
    }, 1000);
    return true;
  }

  function seedProcessedFromRecords() {
    state.historicalSeen = new Set();
    if (!config.filters.skipRecorded) return;
    for (const record of state.records) {
      if (record.href) state.historicalSeen.add(record.href);
    }
    const added = state.historicalSeen.size;
    if (added > 0) updateStatus(`已载入 ${added} 条历史岗位，启动后会跳过这些已扫岗位。`);
  }

  function hydratePanelFromCampaign() {
    if (!state.campaign?.active && !state.campaign?.paused) return;
    applySavedPanelSettings(state.campaign.settings);
    setPanelValue("#baf-threshold", config.threshold);
    setPanelValue("#baf-max", config.maxJobs);
    setPanelValue("#baf-job-nature", jobNatureDisplayValue(config.filters.jobNature));
    setPanelValue("#baf-target-keywords", (config.filters.targetKeywords?.length ? config.filters.targetKeywords : DEFAULT_TARGET_KEYWORDS).join("，"));
    setPanelValue("#baf-salary-min", config.filters.salaryMin);
    setPanelValue("#baf-salary-max", config.filters.salaryMax);
    setPanelValue("#baf-keywords", campaignSearchKeywordsText());
    setPanelValue("#baf-per-keyword", state.campaign.perKeywordMax);
    setPanelValue("#baf-daily-scan-limit", config.safety.dailyScanLimit);
    setPanelValue("#baf-daily-favorite-limit", config.safety.dailyFavoriteLimit);
    setPanelValue("#baf-pause-every", config.safety.pauseEvery);
    setPanelValue("#baf-pause-min", config.safety.pauseMinSec);
    setPanelValue("#baf-pause-max", config.safety.pauseMaxSec);
    setPanelChecked("#baf-local-ai-info", config.localAi.queryInfo);
    setPanelChecked("#baf-auto-greet", config.greeting.enabled);
    setPanelValue("#baf-greet-min-score", config.greeting.minScore || config.threshold);
    setPanelValue("#baf-greet-limit", config.greeting.dailyLimit);
    setPanelValue("#baf-greet-template", config.greeting.template);
    setPanelValue("#baf-ai-model", state.aiSettings.model || "deepseek-v4-flash");
    setPanelValue("#baf-positive", (config.filters.customPositive || []).join("\n"));
    setPanelValue("#baf-negative", (config.filters.customNegative || []).join("\n"));
    setPanelChecked("#baf-include-blank", (state.campaign.keywords || []).includes(""));
    setPanelChecked("#baf-expand-keywords", state.campaign.settings?.search?.expandKeywords ?? true);
    setPanelChecked("#baf-skip-recorded", config.filters.skipRecorded);
  }

  function makeDraggable(panel) {
    const title = panel.querySelector(".baf-title");
    const clampPanelPosition = () => {
      const r = panel.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - Math.min(panel.offsetWidth, window.innerWidth - 16) - 8);
      const maxTop = Math.max(8, window.innerHeight - Math.min(panel.offsetHeight, window.innerHeight - 16) - 8);
      const nextLeft = Math.min(Math.max(8, r.left), maxLeft);
      const nextTop = Math.min(Math.max(8, r.top), maxTop);
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ left: nextLeft, top: nextTop }));
    };
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(PANEL_POS_KEY) || "null"); } catch (_) { return null; }
    })();
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      panel.style.left = `${saved.left}px`;
      panel.style.top = `${saved.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      requestAnimationFrame(clampPanelPosition);
    }

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    title.addEventListener("mousedown", e => {
      dragging = true;
      const r = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = r.left;
      startTop = r.top;
      panel.style.left = `${r.left}px`;
      panel.style.top = `${r.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      e.preventDefault();
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const maxLeft = Math.max(8, window.innerWidth - Math.min(panel.offsetWidth, window.innerWidth - 16) - 8);
      const maxTop = Math.max(8, window.innerHeight - Math.min(panel.offsetHeight, window.innerHeight - 16) - 8);
      const nextLeft = Math.min(Math.max(8, startLeft + e.clientX - startX), maxLeft);
      const nextTop = Math.min(Math.max(8, startTop + e.clientY - startY), maxTop);
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      clampPanelPosition();
    });
    window.addEventListener("resize", clampPanelPosition);
  }

  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "boss-ai-autofav-panel";
    panel.innerHTML = `
      <div class="baf-title">
        <div class="baf-title-main">
          <strong>BOSS-Auto-Job-Extension <span class="baf-version">v2.0.6</span></strong>
          <span>职位列表</span>
        </div>
        <div id="baf-run-state" class="baf-run-state baf-state-idle" title="灰灯｜未启动">
          <span class="baf-run-dot" aria-hidden="true"></span>
          <span id="baf-run-text" class="baf-run-text">灰灯｜未启动</span>
        </div>
        <button id="baf-toggle" type="button">收起</button>
      </div>
      <div class="baf-status-card">
        <div id="baf-status" class="baf-status-line">等待进入职位列表</div>
        <div id="baf-today-progress" class="baf-today-progress"></div>
        <div class="baf-current-action">
          <div class="baf-section-title">当前动作</div>
          <strong id="baf-current-action-text">等待开始扫描</strong>
          <span id="baf-last-result">最近结果：还没有岗位结果</span>
          <span id="baf-last-runtime-log">运行日志：还没有启动事件</span>
        </div>
        <div class="baf-protection-row">
          <span id="baf-protection-text">本次 0｜藏 0｜复 0｜今日扫 0/500｜藏 0/80｜招呼 0/20</span>
          <button id="baf-reset-progress" class="baf-mini-primary" type="button">重置今日</button>
        </div>
      </div>
      <div class="baf-body">
        <div class="baf-section baf-primary-section">
          <div class="baf-section-head">
            <div>
              <div class="baf-section-title">我要找什么岗位</div>
              <div class="baf-hint">先卡岗位性质，再卡目标方向。两者都过了才会考虑收藏。</div>
            </div>
            <button id="baf-generate-profile" type="button" class="baf-mini-primary">生成搜索词</button>
          </div>
          <div class="baf-grid">
            <label>岗位性质<input id="baf-job-nature" class="baf-full-input" value="${escapeAttr(jobNatureDisplayValue(config.filters.jobNature))}" placeholder="销售 / 运营 / 客户成功 / 产品" /></label>
            <label>目标方向<input id="baf-target-keywords" class="baf-full-input" value="${escapeAttr((config.filters.targetKeywords?.length ? config.filters.targetKeywords : DEFAULT_TARGET_KEYWORDS).join("，"))}" placeholder="AI客服 / 跨境电商 / 教育SaaS" /></label>
          </div>
          <div class="baf-salary-row">
            <label>薪资<input id="baf-salary-min" placeholder="最低" /></label>
            <span>-</span>
            <input id="baf-salary-max" placeholder="最高" />
            <span>K</span>
            <label><input id="baf-skip-recorded" type="checkbox" checked />跳过已扫</label>
          </div>
          <div class="baf-hint baf-block-hint">目标方向尽量写到行业、产品或场景。只写“互联网”“软件”会很宽。</div>
          <details class="baf-config-preview">
            <summary>配置摘要 / 规则预览</summary>
            <pre id="baf-config-summary"></pre>
            <div class="baf-field baf-preview-actions">
              <button id="baf-copy-config" type="button" class="baf-muted">复制配置</button>
              <span class="baf-hint">后续网页端和智能体会读取这份配置。</span>
            </div>
          </details>
        </div>

        <div class="baf-section">
          <div class="baf-section-title">怎么扫</div>
          <div class="baf-segments" role="group" aria-label="扫描模式">
            <button id="baf-mode-current" type="button" class="baf-segment active">当前列表</button>
            <button id="baf-mode-task" type="button" class="baf-segment">多关键词</button>
          </div>
          <div class="baf-hint baf-block-hint">搜索词在上面生成；这里负责选择扫描方式和手动删改搜索词。</div>
          <label class="baf-keywords-label">搜索词</label>
          <textarea id="baf-keywords" placeholder="每行一个关键词，也可以用逗号隔开，如：AI客服销售, 跨境电商运营, SaaS客户成功">${currentSearchKeyword()}</textarea>
          <div id="baf-keyword-note" class="baf-note"></div>
          <div class="baf-hint baf-block-hint">多关键词模式才会自动切换搜索词；当前列表模式只扫当前页面。</div>
          <div class="baf-field">
            <label><input id="baf-include-blank" type="checkbox" checked />最后扫推荐流</label>
            <label><input id="baf-expand-keywords" type="checkbox" checked />自动扩展关键词</label>
            <label>每词</label>
            <input id="baf-per-keyword" value="${DEFAULT_PER_KEYWORD_MAX}" />
          </div>
        </div>

        <div class="baf-section baf-threshold-section">
          <div class="baf-threshold-row">
            <span class="baf-section-title baf-inline-title">收藏标准</span>
            <div class="baf-segments baf-threshold-segments" role="group" aria-label="收藏标准">
              <button type="button" class="baf-threshold-mode" data-threshold="55">宽松</button>
              <button type="button" class="baf-threshold-mode active" data-threshold="60">标准</button>
              <button type="button" class="baf-threshold-mode" data-threshold="70">严格</button>
            </div>
            <label class="baf-score-inline">收藏分<input id="baf-threshold" value="${config.threshold}" /></label>
          </div>
        </div>

        <div class="baf-section baf-failures">
          <div class="baf-section-head baf-compact-head">
            <div class="baf-section-title">最近收藏失败</div>
            <strong id="baf-failure-count">0 条</strong>
          </div>
          <div class="baf-field">
            <button id="baf-copy-failures" type="button" class="baf-mini-primary">复制最近失败</button>
            <button id="baf-open-failure" type="button" class="baf-mini-primary">打开最近失败</button>
            <button id="baf-back-search" type="button" class="baf-mini-primary">回失败搜索</button>
          </div>
          <div id="baf-recent-export" class="baf-hint">最近导出：还没有复制操作</div>
        </div>

          <div class="baf-section baf-local-ai">
          <label><input id="baf-local-ai-info" type="checkbox" checked />LLM 判断岗位详情</label>
          <div class="baf-hint">默认开启。保存 API Key 后，扫描时会先确认岗位详情，再调用 AI 给出最终判断；没有 Key 时不能启动扫描。</div>
        </div>

        <div class="baf-section baf-greeting">
          <div class="baf-section-title">自动打招呼</div>
          <div class="baf-hint">默认关闭；开启后只在收藏成功后尝试。</div>
          <div class="baf-field">
            <label><input id="baf-auto-greet" type="checkbox" />开启自动打招呼</label>
            <label>最低分 <input id="baf-greet-min-score" value="${config.greeting.minScore || config.threshold}" /> 分</label>
            <label>今日最多 <input id="baf-greet-limit" value="${config.greeting.dailyLimit}" /> 次</label>
          </div>
          <textarea id="baf-greet-template">${escapeHtml(config.greeting.template)}</textarea>
          <div class="baf-hint">只对已收藏且达到最低分的岗位发送编辑好的内容；找不到同一聊天窗口的发送按钮会记录失败，不跨窗口误点。</div>
        </div>

        <details class="baf-section baf-advanced">
          <summary>高级规则 / AI Key</summary>
          <div class="baf-ai-box">
            <div class="baf-section-title">AI 生成（OpenAI 兼容）</div>
            <div class="baf-field baf-ai-row">
              <label>API 地址</label>
              <a class="baf-link" href="https://api.toporeduce.cn" target="_blank" rel="noreferrer">https://api.toporeduce.cn</a>
              <label>API Key</label>
              <input id="baf-ai-key" class="baf-ai-key" type="password" placeholder="sk-..." />
            </div>
            <div class="baf-field baf-ai-row">
              <label>模型</label>
              <input id="baf-ai-model" class="baf-ai-model" value="${escapeAttr(state.aiSettings.model || "deepseek-v4-flash")}" />
              <button id="baf-show-key" type="button" class="baf-mini-primary">显示 Key</button>
              <button id="baf-save-key" type="button" class="baf-mini-primary">保存 Key</button>
              <button id="baf-clear-ai-key" type="button" class="baf-muted">清除 Key</button>
              <span id="baf-ai-key-state" class="baf-ai-key-state">${state.aiSettings.hasKey ? "已保存" : "未保存"}</span>
            </div>
            <div class="baf-hint">API 地址固定；Key 保存在扩展私有存储中，AI 请求由后台脚本读取 Key 并添加 Authorization。</div>
          </div>
          <div class="baf-field">
            <label>当前列表最多扫</label>
            <input id="baf-max" value="${config.maxJobs}" />
            <label>今日最多扫</label>
            <input id="baf-daily-scan-limit" value="${config.safety.dailyScanLimit}" />
            <label>今日最多藏</label>
            <input id="baf-daily-favorite-limit" value="${config.safety.dailyFavoriteLimit}" />
          </div>
          <div class="baf-field">
            <label>每扫</label>
            <input id="baf-pause-every" value="${config.safety.pauseEvery}" />
            <span>个休息</span>
            <input id="baf-pause-min" value="${config.safety.pauseMinSec}" />
            <span>-</span>
            <input id="baf-pause-max" value="${config.safety.pauseMaxSec}" />
            <span>秒</span>
          </div>
          <div class="baf-field">
            <button id="baf-generate-rules" type="button" class="baf-muted">生成加分词/排除词</button>
            <span class="baf-hint">先优化搜索词，再生成少量加分词和排除词。</span>
          </div>
          <div class="baf-textareas">
            <label>正向词<textarea id="baf-positive" placeholder="每行一个，如：AI客服&#10;客户成功&#10;Agent"></textarea></label>
            <label>反向词<textarea id="baf-negative" placeholder="每行一个，如：保险&#10;贷款&#10;营业员&#10;招生&#10;课程销售"></textarea></label>
          </div>
          <div id="baf-rules-note" class="baf-note"></div>
        </details>

        <div class="baf-section baf-recent">
          <div class="baf-section-head baf-compact-head">
            <div class="baf-section-title">最近判断</div>
            <div class="baf-log-tabs">
              <button type="button" data-filter="all" class="active">全部</button>
              <button type="button" data-filter="favorite">已收藏</button>
              <button type="button" data-filter="favorite_failed">收藏失败</button>
              <button type="button" data-filter="review">待复核</button>
              <button type="button" data-filter="exclude">已排除</button>
            </div>
          </div>
          <div id="baf-log"></div>
        </div>
        <div class="baf-section baf-boundary">
          <div class="baf-section-title">使用边界</div>
          <div class="baf-hint">只做岗位粗筛、收藏、记录和复核；默认不自动打招呼，开启后仅对已收藏且达标岗位发送编辑好的招呼内容；不自动投递、不读取聊天。遇到验证、登录异常或账号提示，立即停止。</div>
        </div>
      </div>
      <div class="baf-actions">
        <button id="baf-start" class="baf-secondary">启动/继续</button>
        <button id="baf-stop" class="baf-warn">暂停</button>
        <button id="baf-table" class="baf-blue">复制表格</button>
        <details class="baf-more-actions">
          <summary>更多导出与维护</summary>
          <div class="baf-more-grid">
            <button id="baf-json" class="baf-blue">复制JSON</button>
            <button id="baf-copy-review-table" class="baf-blue">复制待复核表格</button>
            <button id="baf-copy-review-json" class="baf-blue">复制待复核JSON</button>
            <button id="baf-copy-review-links" class="baf-blue">复制待复核链接</button>
            <button id="baf-copy-page-links" class="baf-muted">复制页链接</button>
            <button id="baf-copy-favorites-only" class="baf-mini-primary">仅复制已收藏</button>
            <button id="baf-copy-review-only" class="baf-mini-primary">仅复制待复核</button>
            <button id="baf-copy-failure-only" class="baf-mini-primary">仅复制收藏失败</button>
            <button id="baf-clear-failures" class="baf-mini-primary">清空收藏失败</button>
            <button id="baf-copy-runtime-log" class="baf-muted">复制运行日志</button>
            <button id="baf-clear-runtime-log" class="baf-muted">清空运行日志</button>
            <button id="baf-debug" class="baf-muted">复制诊断</button>
            <button id="baf-clear" class="baf-muted">清空表</button>
          </div>
        </details>
      </div>
      <div id="baf-feedback" class="baf-feedback">
        <div class="baf-section-title">本次筛选反馈</div>
        <div class="baf-field">
          <button id="baf-feedback-wide" type="button">收藏太宽了</button>
          <button id="baf-feedback-narrow" type="button">漏掉好岗位</button>
        </div>
        <div class="baf-feedback-grid">
          <label>这个词我想多看<textarea id="baf-more-words" placeholder="如：客户成功、售前解决方案、AI客服实施"></textarea></label>
          <label>这个词我不想看<textarea id="baf-less-words" placeholder="如：金融、课程、短剧、单休"></textarea></label>
        </div>
        <div class="baf-field">
          <button id="baf-apply-feedback" type="button">应用反馈到规则</button>
          <span class="baf-hint">会更新正向词、反向词、搜索词和收藏分</span>
        </div>
      </div>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #boss-ai-autofav-panel {
        position: fixed;
        right: max(8px, env(safe-area-inset-right));
        bottom: max(8px, env(safe-area-inset-bottom));
        width: min(520px, calc(100vw - 16px));
        max-width: calc(100vw - 16px);
        max-height: min(84vh, calc(100vh - 16px));
        box-sizing: border-box;
        z-index: 2147483647;
        background: #ffffff;
        color: #111827;
        border: 1px solid #d8dee8;
        border-radius: 12px;
        box-shadow: 0 18px 48px rgba(15, 23, 42, .18);
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      #boss-ai-autofav-panel.baf-collapsed {
        width: min(390px, calc(100vw - 16px));
        max-height: none;
      }
      #boss-ai-autofav-panel *,
      #boss-ai-autofav-panel *::before,
      #boss-ai-autofav-panel *::after {
        box-sizing: border-box;
      }
      #boss-ai-autofav-panel.baf-collapsed .baf-body,
      #boss-ai-autofav-panel.baf-collapsed .baf-actions,
      #boss-ai-autofav-panel.baf-collapsed .baf-feedback {
        display: none !important;
      }
      #boss-ai-autofav-panel.baf-collapsed .baf-status-card {
        display: block;
        max-height: 132px;
        border-bottom: 0;
      }
      #boss-ai-autofav-panel .baf-title {
        padding: 10px 12px;
        background: #0f766e;
        color: #ffffff;
        cursor: move;
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      #boss-ai-autofav-panel .baf-title-main {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      #boss-ai-autofav-panel .baf-title-main strong {
        font-size: 14px;
        line-height: 1.2;
      }
      #boss-ai-autofav-panel .baf-run-state {
        flex: 1 1 auto;
        min-width: 138px;
        max-width: 190px;
        justify-self: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.32);
        background: rgba(255,255,255,.12);
        color: #ffffff;
        font-size: 12px;
        font-weight: 800;
        line-height: 1;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel .baf-run-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #94a3b8;
        box-shadow: 0 0 0 3px rgba(148, 163, 184, .18);
        flex: 0 0 auto;
      }
      #boss-ai-autofav-panel .baf-state-idle .baf-run-dot {
        background: #94a3b8;
        box-shadow: 0 0 0 3px rgba(148, 163, 184, .22);
      }
      #boss-ai-autofav-panel .baf-state-running .baf-run-dot {
        background: #22c55e;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, .25), 0 0 12px rgba(34, 197, 94, .75);
      }
      #boss-ai-autofav-panel .baf-state-error .baf-run-dot {
        background: #ef4444;
        box-shadow: 0 0 0 3px rgba(239, 68, 68, .25), 0 0 12px rgba(239, 68, 68, .65);
      }
      #boss-ai-autofav-panel .baf-state-complete .baf-run-dot {
        background: #facc15;
        box-shadow: 0 0 0 3px rgba(250, 204, 21, .25), 0 0 12px rgba(250, 204, 21, .65);
      }
      .baf-missing-key-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(15, 23, 42, .42);
      }
      .baf-missing-key-dialog {
        width: min(360px, calc(100vw - 36px));
        border-radius: 10px;
        border: 1px solid #fecaca;
        background: #ffffff;
        box-shadow: 0 22px 60px rgba(15, 23, 42, .28);
        padding: 16px;
        color: #111827;
      }
      .baf-missing-key-title {
        font-size: 15px;
        font-weight: 800;
        color: #b91c1c;
        margin-bottom: 8px;
      }
      .baf-missing-key-text {
        font-size: 13px;
        line-height: 1.55;
        color: #374151;
        margin-bottom: 14px;
      }
      #baf-missing-key-close {
        width: 100%;
        border: 0;
        border-radius: 8px;
        padding: 9px 12px;
        background: #dc2626;
        color: #ffffff;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      #boss-ai-autofav-panel .baf-version {
        font-size: 12px;
        font-weight: 600;
        margin-left: 4px;
        opacity: .92;
      }
      #boss-ai-autofav-panel .baf-title span {
        color: #ccfbf1;
        font-weight: 500;
        font-size: 12px;
      }
      #boss-ai-autofav-panel #baf-toggle {
        flex: 0 0 auto;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.45);
        background: rgba(255,255,255,.12);
        color: #ffffff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      #boss-ai-autofav-panel .baf-actions {
        display: flex;
        gap: 7px;
        align-items: center;
        min-width: 0;
      }
      #boss-ai-autofav-panel .baf-actions {
        flex: 0 0 auto;
        padding: 9px 10px;
        border-top: 1px solid #e5e7eb;
        background: #f8fafc;
        flex-wrap: wrap;
        box-shadow: 0 -8px 22px rgba(15, 23, 42, .06);
      }
      #boss-ai-autofav-panel .baf-body {
        padding: 10px;
        overflow: auto;
        flex: 1 1 auto;
        min-height: 160px;
        overscroll-behavior: contain;
        background: #f8fafc;
      }
      #boss-ai-autofav-panel .baf-section {
        padding: 10px;
        margin-bottom: 9px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
      }
      #boss-ai-autofav-panel .baf-section-title {
        font-weight: 700;
        color: #0f766e;
        margin-bottom: 8px;
        font-size: 13px;
      }
      #boss-ai-autofav-panel .baf-link {
        color: #0f766e;
        text-decoration: underline;
        word-break: break-all;
      }
      #boss-ai-autofav-panel .baf-section-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
        margin-bottom: 9px;
      }
      #boss-ai-autofav-panel .baf-primary-section {
        border-color: #99f6e4;
        box-shadow: 0 0 0 1px rgba(20, 184, 166, .08);
      }
      #boss-ai-autofav-panel .baf-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
        gap: 8px;
        align-items: end;
      }
      #boss-ai-autofav-panel .baf-grid label {
        color: #374151;
        font-weight: 700;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      #boss-ai-autofav-panel input {
        width: 58px;
        max-width: 100%;
        padding: 6px 7px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #111827;
        outline: none;
      }
      #boss-ai-autofav-panel input:focus,
      #boss-ai-autofav-panel textarea:focus {
        border-color: #14b8a6;
        box-shadow: 0 0 0 3px rgba(20, 184, 166, .14);
      }
      #boss-ai-autofav-panel .baf-nature-input {
        width: 142px;
      }
      #boss-ai-autofav-panel .baf-target-input {
        width: 190px;
      }
      #boss-ai-autofav-panel .baf-full-input {
        width: 100%;
        box-sizing: border-box;
      }
      #boss-ai-autofav-panel .baf-field {
        display: flex;
        gap: 7px;
        align-items: center;
        margin-bottom: 7px;
        flex-wrap: wrap;
        min-width: 0;
      }
      #boss-ai-autofav-panel .baf-field label {
        color: #374151;
        font-weight: 600;
      }
      #boss-ai-autofav-panel .baf-salary-row {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 8px 0 4px;
        flex-wrap: wrap;
      }
      #boss-ai-autofav-panel .baf-salary-row label {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #374151;
        font-weight: 700;
      }
      #boss-ai-autofav-panel .baf-salary-row input {
        width: 64px;
      }
      #boss-ai-autofav-panel .baf-threshold-section {
        padding: 8px 10px;
      }
      #boss-ai-autofav-panel .baf-threshold-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
      }
      #boss-ai-autofav-panel .baf-inline-title {
        margin: 0;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel .baf-threshold-segments {
        margin: 0;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      #boss-ai-autofav-panel .baf-score-inline {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #374151;
        font-weight: 700;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel .baf-score-inline input {
        width: 48px;
      }
      #boss-ai-autofav-panel .baf-hint {
        color: #6b7280;
        font-size: 12px;
      }
      #boss-ai-autofav-panel .baf-note {
        display: none;
        margin: 6px 0 8px;
        padding: 7px 8px;
        border-radius: 8px;
        background: #fefce8;
        border: 1px solid #fde68a;
        color: #854d0e;
        font-size: 12px;
        white-space: pre-line;
      }
      #boss-ai-autofav-panel .baf-config-preview {
        margin-top: 8px;
        border: 1px solid #dbeafe;
        border-radius: 9px;
        background: #f8fafc;
      }
      #boss-ai-autofav-panel .baf-config-preview summary {
        padding: 7px 8px;
        cursor: pointer;
        color: #0f766e;
        font-weight: 700;
      }
      #boss-ai-autofav-panel .baf-config-preview pre {
        margin: 0;
        padding: 0 8px 8px;
        color: #475569;
        white-space: pre-line;
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #boss-ai-autofav-panel .baf-preview-actions {
        padding: 0 8px 8px;
        margin-bottom: 0;
      }
      #boss-ai-autofav-panel .baf-ai-box {
        padding-bottom: 8px;
        margin-bottom: 8px;
        border-bottom: 1px solid #e5e7eb;
      }
      #boss-ai-autofav-panel input.baf-ai-key {
        width: 185px;
      }
      #boss-ai-autofav-panel input.baf-ai-model {
        width: 135px;
      }
      #boss-ai-autofav-panel .baf-ai-key-state {
        color: #6b7280;
        font-size: 12px;
        font-weight: 700;
        min-width: 46px;
      }
      #boss-ai-autofav-panel .baf-ai-key-state-ok {
        color: #15803d;
      }
      #boss-ai-autofav-panel .baf-ai-key-state-pending {
        color: #b45309;
      }
      #boss-ai-autofav-panel .baf-boundary {
        background: #f8fafc;
      }
      #boss-ai-autofav-panel .baf-block-hint {
        margin: -2px 0 8px;
      }
      #boss-ai-autofav-panel .baf-top-gap {
        margin-top: 9px;
      }
      #boss-ai-autofav-panel .baf-segments {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 8px;
      }
      #boss-ai-autofav-panel .baf-segments button {
        background: #eef2f7;
        color: #475569;
        border: 1px solid #e2e8f0;
      }
      #boss-ai-autofav-panel .baf-segments button.active {
        background: #0f766e;
        color: #ffffff;
        border-color: #0f766e;
      }
      #boss-ai-autofav-panel .baf-keywords-label {
        display: block;
        margin: 2px 0 3px;
        color: #334155;
        font-weight: 700;
        font-size: 12px;
      }
      #boss-ai-autofav-panel input[type="checkbox"] {
        width: auto;
        padding: 0;
      }
      #boss-ai-autofav-panel .baf-textareas {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      #boss-ai-autofav-panel textarea {
        width: 100%;
        max-width: 100%;
        height: 56px;
        margin-top: 4px;
        box-sizing: border-box;
        resize: vertical;
        padding: 7px 8px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #111827;
        font: inherit;
        outline: none;
      }
      #boss-ai-autofav-panel textarea:disabled {
        background: #f1f5f9;
        color: #94a3b8;
        cursor: not-allowed;
      }
      #boss-ai-autofav-panel #baf-keywords {
        height: 58px;
        margin: 5px 0 8px;
      }
      #boss-ai-autofav-panel button {
        padding: 7px 10px;
        min-height: 32px;
        border-radius: 8px;
        border: 0;
        cursor: pointer;
        background: #e5e7eb;
        color: #111827;
        font-weight: 700;
        font-size: 12px;
        line-height: 1.2;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel button:hover {
        filter: brightness(.96);
      }
      #boss-ai-autofav-panel button.baf-primary { background: #0f766e; color: #ffffff; }
      #boss-ai-autofav-panel button.baf-secondary { background: #e0f2fe; color: #075985; }
      #boss-ai-autofav-panel button.baf-warn { background: #f97316; color: #fff; }
      #boss-ai-autofav-panel button.baf-blue { background: #2563eb; color: #fff; }
      #boss-ai-autofav-panel button.baf-muted { background: #e5e7eb; color: #374151; }
      #boss-ai-autofav-panel button:disabled {
        opacity: .62;
        cursor: not-allowed;
        filter: grayscale(.15);
      }
      #boss-ai-autofav-panel.baf-running #baf-start {
        background: #14b8a6;
        color: #ffffff;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.24);
      }
      #boss-ai-autofav-panel.baf-running #baf-stop {
        background: #0f766e;
        color: #ffffff;
      }
      #boss-ai-autofav-panel.baf-paused #baf-start {
        background: #0f766e;
        color: #ffffff;
      }
      #boss-ai-autofav-panel button.baf-mini-primary {
        background: #ecfeff;
        color: #0f766e;
        border: 1px solid #99f6e4;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel .baf-status-card {
        padding: 6px 10px 7px;
        color: #334155;
        background: #f0fdfa;
        border-bottom: 1px solid #ccfbf1;
        flex: 0 0 auto;
        overflow: hidden;
        white-space: pre-line;
        font-size: 12px;
        line-height: 1.22;
      }
      #boss-ai-autofav-panel #baf-today-progress {
        display: none;
      }
      #boss-ai-autofav-panel #baf-status {
        max-height: 42px;
        overflow: hidden;
      }
      #boss-ai-autofav-panel .baf-current-action {
        display: grid;
        grid-template-columns: 68px minmax(0, 1fr);
        gap: 3px 8px;
        margin-top: 5px;
        padding-top: 5px;
        border-top: 1px solid #ccfbf1;
        align-items: baseline;
      }
      #boss-ai-autofav-panel .baf-current-action .baf-section-title {
        grid-row: span 3;
        margin: 0;
      }
      #boss-ai-autofav-panel .baf-current-action strong {
        display: block;
        color: #374151;
        margin: 0;
        line-height: 1.2;
      }
      #boss-ai-autofav-panel .baf-current-action span {
        display: block;
        color: #64748b;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel .baf-protection-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid #ccfbf1;
        color: #0f766e;
        font-weight: 700;
      }
      #boss-ai-autofav-panel .baf-protection-row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #boss-ai-autofav-panel .baf-protection-row button {
        flex: 0 0 auto;
        padding: 5px 9px;
      }
      #baf-log {
        padding: 0;
        max-height: 188px;
        overflow: auto;
        background: #ffffff;
      }
      #boss-ai-autofav-panel .baf-empty {
        padding: 10px 4px;
        color: #64748b;
        font-size: 12px;
      }
      #boss-ai-autofav-panel .baf-advanced {
        padding: 0;
      }
      #boss-ai-autofav-panel .baf-advanced summary {
        padding: 10px;
        cursor: pointer;
        font-weight: 700;
        color: #0f766e;
      }
      #boss-ai-autofav-panel .baf-advanced[open] {
        padding: 0 10px 10px;
      }
      #boss-ai-autofav-panel .baf-advanced[open] summary {
        padding: 10px 0 0;
        margin-bottom: 8px;
      }
      #boss-ai-autofav-panel .baf-failures {
        border-color: #fecaca;
        background: #fff7f7;
      }
      #boss-ai-autofav-panel .baf-failures .baf-section-title,
      #boss-ai-autofav-panel #baf-failure-count {
        color: #991b1b;
      }
      #boss-ai-autofav-panel .baf-local-ai,
      #boss-ai-autofav-panel .baf-greeting {
        background: #f8fafc;
      }
      #boss-ai-autofav-panel .baf-local-ai label,
      #boss-ai-autofav-panel .baf-greeting label {
        font-weight: 700;
        color: #334155;
      }
      #boss-ai-autofav-panel #baf-greet-template {
        height: 62px;
      }
      #boss-ai-autofav-panel .baf-compact-head {
        align-items: center;
        margin-bottom: 7px;
      }
      #boss-ai-autofav-panel .baf-log-tabs {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      #boss-ai-autofav-panel .baf-log-tabs button {
        padding: 5px 8px;
        border: 1px solid #99f6e4;
        background: #ecfdf5;
        color: #0f766e;
      }
      #boss-ai-autofav-panel .baf-log-tabs button.active {
        background: #0f766e;
        color: #ffffff;
      }
      #boss-ai-autofav-panel .baf-more-actions {
        width: 100%;
        padding: 0;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #ffffff;
      }
      #boss-ai-autofav-panel .baf-more-actions summary {
        padding: 8px 10px;
        cursor: pointer;
        color: #334155;
        font-weight: 700;
      }
      #boss-ai-autofav-panel .baf-more-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
        gap: 7px;
        padding: 0 8px 8px;
      }
      #boss-ai-autofav-panel .baf-ai-row {
        align-items: center;
      }
      #boss-ai-autofav-panel .baf-feedback {
        display: none;
        flex: 0 0 auto;
        padding: 9px 10px;
        border-bottom: 1px solid #e5e7eb;
        background: #fffbeb;
      }
      #boss-ai-autofav-panel .baf-feedback-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 8px;
      }
      #boss-ai-autofav-panel .baf-feedback textarea {
        height: 44px;
      }
      #boss-ai-autofav-panel .baf-feedback button {
        background: #f59e0b;
        color: #ffffff;
      }
      #boss-ai-autofav-panel .baf-feedback button#baf-apply-feedback {
        background: #2563eb;
        color: #fff;
      }
      .baf-item {
        border-bottom: 1px solid #e5e7eb;
        padding: 7px 0;
      }
      .baf-action { font-weight: 700; }
      .baf-action.favorite { color: #0f766e; }
      .baf-action.review { color: #d97706; }
      .baf-action.exclude { color: #64748b; }
      .baf-action.skip { color: #dc2626; }
      .baf-small { color: #64748b; font-size: 12px; }
      @media (max-width: 560px), (max-height: 620px) {
        #boss-ai-autofav-panel {
          right: 8px;
          bottom: 8px;
          width: calc(100vw - 16px);
          max-height: calc(100vh - 16px);
          border-radius: 10px;
        }
        #boss-ai-autofav-panel.baf-collapsed {
          width: calc(100vw - 16px);
        }
        #boss-ai-autofav-panel .baf-grid,
        #boss-ai-autofav-panel .baf-feedback-grid {
          grid-template-columns: 1fr;
        }
        #boss-ai-autofav-panel .baf-threshold-row {
          grid-template-columns: 1fr;
          align-items: stretch;
        }
        #boss-ai-autofav-panel .baf-threshold-segments {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        #boss-ai-autofav-panel .baf-score-inline {
          justify-content: space-between;
        }
        #boss-ai-autofav-panel .baf-current-action {
          grid-template-columns: 1fr;
        }
        #boss-ai-autofav-panel .baf-current-action .baf-section-title {
          grid-row: auto;
        }
        #boss-ai-autofav-panel .baf-protection-row {
          align-items: stretch;
          flex-direction: column;
        }
        #boss-ai-autofav-panel .baf-protection-row span {
          white-space: normal;
        }
        #boss-ai-autofav-panel .baf-actions > button {
          flex: 1 1 96px;
        }
      }
      @media (max-height: 520px) {
        #boss-ai-autofav-panel .baf-status-card {
          max-height: 132px;
          overflow: auto;
        }
        #boss-ai-autofav-panel .baf-body {
          min-height: 96px;
        }
      }
    `;
    document.body.appendChild(style);
    document.body.appendChild(panel);
    makeDraggable(panel);
    const toggleButton = panel.querySelector("#baf-toggle");
    const applyCollapsed = collapsed => {
      panel.classList.toggle("baf-collapsed", collapsed);
      if (toggleButton) toggleButton.textContent = collapsed ? "展开" : "收起";
      localStorage.setItem(PANEL_COLLAPSED_KEY, collapsed ? "1" : "0");
    };
    applyCollapsed(localStorage.getItem(PANEL_COLLAPSED_KEY) === "1");
    toggleButton?.addEventListener("mousedown", event => {
      event.stopPropagation();
    });
    toggleButton?.addEventListener("click", event => {
      event.stopPropagation();
      applyCollapsed(!panel.classList.contains("baf-collapsed"));
    });
    if (state.campaign?.active) {
      hydratePanelFromCampaign();
    } else if (state.campaign?.paused) {
      hydratePanelFromCampaign();
    } else {
      hydratePanelFromSettings(state.settings);
    }
    panel.addEventListener("input", event => {
      if (event.target.closest(".baf-feedback")) return;
      if (event.target.matches("#baf-ai-key")) return;
      schedulePanelSettingsSave();
    });
    panel.addEventListener("change", event => {
      if (event.target.closest(".baf-feedback")) return;
      if (event.target.matches("#baf-ai-key")) return;
      if (event.target.matches("#baf-threshold")) {
        normalizeThresholdInput();
        return;
      }
      schedulePanelSettingsSave();
    });
    panel.querySelector("#baf-threshold")?.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      normalizeThresholdInput();
      event.target.blur();
    });

    const setScanMode = mode => {
      panel.dataset.scanMode = mode;
      panel.querySelector("#baf-mode-current")?.classList.toggle("active", mode === "current");
      panel.querySelector("#baf-mode-task")?.classList.toggle("active", mode === "task");
      const keywords = panel.querySelector("#baf-keywords");
      if (keywords) keywords.disabled = mode === "current";
      const startButton = panel.querySelector("#baf-start");
      if (startButton) {
        startButton.textContent = mode === "task" ? "启动/继续" : "\u5f00\u59cb\u626b\u63cf";
        startButton.classList.toggle("baf-primary", mode === "task");
        startButton.classList.toggle("baf-secondary", mode !== "task");
      }
    };
    const setThresholdMode = value => {
      const threshold = Number(value || 60);
      setPanelValue("#baf-threshold", threshold);
      panel.querySelectorAll(".baf-threshold-mode").forEach(button => {
        button.classList.toggle("active", Number(button.dataset.threshold) === threshold);
      });
      readPanelConfig();
    };
    const ensureAiKeyBeforeAction = actionText => {
      readPanelConfig();
      if (aiConfigured()) return true;
      alertMissingAiKey(actionText);
      const message = `未保存第三方大模型key，请先在高级规则中填写并保存 Key，再${actionText}。`;
      updateStatus(statusSummary(message));
      setNote("#baf-rules-note", message);
      return false;
    };
    panel.querySelector("#baf-mode-current")?.addEventListener("click", () => setScanMode("current"));
    panel.querySelector("#baf-mode-task")?.addEventListener("click", () => setScanMode("task"));
    panel.querySelectorAll(".baf-threshold-mode").forEach(button => {
      button.addEventListener("click", () => setThresholdMode(button.dataset.threshold));
    });
    panel.querySelectorAll(".baf-log-tabs button").forEach(button => {
      button.addEventListener("click", () => {
        state.logFilter = button.dataset.filter || "all";
        panel.querySelectorAll(".baf-log-tabs button").forEach(tab => {
          tab.classList.toggle("active", tab === button);
        });
        updatePanel();
      });
    });
    panel.querySelector("#baf-show-key")?.addEventListener("click", () => {
      const input = panel.querySelector("#baf-ai-key");
      if (!input) return;
      const visibleKey = input.type === "text";
      input.type = visibleKey ? "password" : "text";
      panel.querySelector("#baf-show-key").textContent = visibleKey ? "显示 Key" : "隐藏 Key";
    });
    const saveAiSettingsFromPanel = async (successMessage = "AI Key 已保存到扩展私有存储。") => {
      const typedKey = String(panel.querySelector("#baf-ai-key")?.value || "").trim();
      const typedRealKey = isMaskedApiKey(typedKey) ? "" : typedKey;
      if (!typedRealKey && !state.aiSettings.hasKey) {
        updateAiKeyState("未保存");
        updateStatus(statusSummary("请先填写第三方大模型 Key，再点击保存。"));
        window.alert("请先填写第三方大模型 Key，再点击保存。");
        return false;
      }
      state.aiSettings.apiKey = typedRealKey;
      state.aiSettings.model = String(panel.querySelector("#baf-ai-model")?.value || state.aiSettings.model || "deepseek-v4-flash").trim();
      const saved = await saveAiSettings();
      if (!saved) {
        updateAiKeyState("保存失败");
        updateStatus(statusSummary("AI Key 保存失败，请检查扩展存储权限后重试。"));
        window.alert("AI Key 保存失败，请检查扩展存储权限后重试。");
        return false;
      }
      updateAiKeyState(typedRealKey ? "已保存" : undefined);
      updateStatus(statusSummary(successMessage));
      return true;
    };
    panel.querySelector("#baf-ai-key")?.addEventListener("input", () => {
      panel.querySelector("#baf-ai-key")?.removeAttribute("data-masked-key");
      updateAiKeyState();
    });
    panel.querySelector("#baf-ai-key")?.addEventListener("keydown", async event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      await saveAiSettingsFromPanel();
    });
    panel.querySelector("#baf-ai-key")?.addEventListener("change", async () => {
      const currentKeyValue = String(panel.querySelector("#baf-ai-key")?.value || "").trim();
      if (!currentKeyValue || isMaskedApiKey(currentKeyValue)) {
        updateAiKeyState();
        return;
      }
      await saveAiSettingsFromPanel();
    });
    panel.querySelector("#baf-save-key")?.addEventListener("click", async () => {
      await saveAiSettingsFromPanel();
    });
    panel.querySelector("#baf-clear-ai-key")?.addEventListener("click", async () => {
      if (!window.confirm("确认清除已保存的第三方大模型 Key 吗？清除后需要重新填写才能启动扫描。")) return;
      const cleared = await clearAiKeySettings();
      updateStatus(statusSummary(cleared ? "AI Key 已从扩展私有存储清除。" : "AI Key 清除失败，请检查扩展存储权限。"));
    });
    panel.querySelector("#baf-ai-model")?.addEventListener("change", async () => {
      state.aiSettings.model = String(panel.querySelector("#baf-ai-model")?.value || state.aiSettings.model || "deepseek-v4-flash").trim();
      const saved = await saveAiSettings();
      if (!saved) {
        updateStatus(statusSummary("AI 模型设置保存失败，请稍后重试。"));
        return;
      }
      updateStatus(statusSummary("AI 模型设置已保存。"));
    });
    panel.querySelector("#baf-generate-profile")?.addEventListener("click", async () => {
      if (!ensureAiKeyBeforeAction("生成搜索词")) return;
      readPanelConfig();
      const issue = targetDirectionIssue();
      if (issue === "未填写目标方向") {
        setNote("#baf-keyword-note", "先填写目标方向，比如：AI客服、跨境电商、教育SaaS。");
        updateStatus(statusSummary("缺少目标方向，暂时不能生成配置。"));
        return;
      }
      setThresholdMode(60);
      const generated = await generateSearchKeywordsFromProfile();
      if (!generated) return;
      setScanMode("task");
      readPanelConfig();
      if (issue === "目标方向太泛") {
        setNote("#baf-keyword-note", "已生成搜索词，但目标方向太泛。建议先手动删掉太宽的词，再点“生成加分词/排除词”。");
      }
      updateStatus(statusSummary(issue === "目标方向太泛" ? "目标方向太泛，先优化搜索词。" : "已生成搜索词，先手动优化后再生成规则。"));
    });
    setScanMode((state.campaign?.active || state.campaign?.paused) ? "task" : "current");
    setThresholdMode(config.threshold);
    panel.querySelector("#baf-start").addEventListener("click", () => {
      if (!ensureAiKeyBeforeAction("启动或继续扫描")) return;
      const mode = panel.dataset.scanMode || "current";
      const resumePaused = Boolean(state.campaign?.paused && state.pausedByUserThisSession);
      debugLog("start_click", { mode, resumePaused });
      updateStatus(statusSummary(mode === "task" ? "\u6b63\u5728\u6309\u5173\u952e\u8bcd\u4f9d\u6b21\u641c\u7d22\u5e76\u626b\u63cf..." : "\u6b63\u5728\u626b\u63cf\u5f53\u524d\u5217\u8868..."));
      start({ campaignMode: mode === "task", resumePaused });
    });
    panel.querySelector("#baf-stop").addEventListener("click", () => {
      debugLog("stop_click");
      state.running = false;
      clearTimers();
      if (state.campaign?.active || state.campaign?.paused) {
        state.campaign.active = false;
        state.campaign.paused = true;
        state.campaign.pausedAt = Date.now();
        state.pausedByUserThisSession = true;
        saveCampaign();
      }
      updatePanel();
      updateStatus(statusSummary("\u6b63\u5728\u6682\u505c\uff0c\u5f53\u524d\u5c97\u4f4d\u5904\u7406\u5b8c\u6210\u540e\u505c\u6b62\u3002"));
    });
    panel.querySelector("#baf-reset-progress")?.addEventListener("click", () => {
      if (!window.confirm("\u786e\u8ba4\u91cd\u7f6e\u4eca\u65e5\u626b\u63cf\u548c\u6536\u85cf\u8fdb\u5ea6\u5417\uff1f")) return;
      resetDailyProgress();
    });
    panel.querySelector("#baf-copy")?.addEventListener("click", async () => {
      const text = JSON.stringify(state.logs.slice().reverse(), null, 2);
      await navigator.clipboard.writeText(text);
      updateStatus("日志已复制。");
    });
    panel.querySelector("#baf-table").addEventListener("click", async () => {
      await navigator.clipboard.writeText(tableText());
      const exportEl = document.querySelector("#baf-recent-export");
      if (exportEl) exportEl.textContent = `最近导出：全量表格 ${state.records.length} 条`;
      updateStatus(`\u8868\u683c\u5df2\u590d\u5236\uff0c\u5171 ${state.records.length} \u6761\u3002`);
    });
    panel.querySelector("#baf-json").addEventListener("click", async () => {
      await navigator.clipboard.writeText(recordsJson());
      const exportEl = document.querySelector("#baf-recent-export");
      if (exportEl) exportEl.textContent = `最近导出：全量 JSON ${state.records.length} 条`;
      updateStatus(`JSON已复制，共 ${state.records.length} 条。后续可交给智能体精筛。`);
    });
    panel.querySelector("#baf-copy-review-table")?.addEventListener("click", async () => {
      const records = recordsByStatus("review");
      await copyToClipboard(tableTextFor(records), `待复核表格已复制，共 ${records.length} 条。`);
      const exportEl = document.querySelector("#baf-recent-export");
      if (exportEl) exportEl.textContent = `最近导出：待复核表格 ${records.length} 条`;
    });
    panel.querySelector("#baf-copy-review-json")?.addEventListener("click", async () => {
      const records = recordsByStatus("review");
      await copyToClipboard(recordsJsonFor(records, "待复核"), `待复核 JSON 已复制，共 ${records.length} 条。`);
      const exportEl = document.querySelector("#baf-recent-export");
      if (exportEl) exportEl.textContent = `最近导出：待复核 JSON ${records.length} 条`;
    });
    panel.querySelector("#baf-copy-review-links")?.addEventListener("click", async () => {
      const records = recordsByStatus("review");
      await copyToClipboard(linksTextFor(records), `待复核链接已复制，共 ${records.length} 条。`);
      const exportEl = document.querySelector("#baf-recent-export");
      if (exportEl) exportEl.textContent = `最近导出：待复核链接 ${records.length} 条`;
    });
    panel.querySelector("#baf-copy-page-links")?.addEventListener("click", async () => {
      const text = pageLinksText();
      await copyToClipboard(text, `当前页链接已复制，共 ${text ? text.split("\n").length : 0} 条。`);
    });
    panel.querySelector("#baf-copy-favorites-only")?.addEventListener("click", async () => {
      const records = recordsByStatus("favorite");
      await copyToClipboard(tableTextFor(records), `已收藏表格已复制，共 ${records.length} 条。`);
    });
    panel.querySelector("#baf-copy-review-only")?.addEventListener("click", async () => {
      const records = recordsByStatus("review");
      await copyToClipboard(tableTextFor(records), `待复核表格已复制，共 ${records.length} 条。`);
    });
    panel.querySelector("#baf-copy-failure-only")?.addEventListener("click", async () => {
      const records = favoriteFailureRecords();
      await copyToClipboard(tableTextFor(records), `收藏失败表格已复制，共 ${records.length} 条。`);
    });
    panel.querySelector("#baf-copy-failures")?.addEventListener("click", async () => {
      const records = favoriteFailureRecords();
      await copyToClipboard(tableTextFor(records), `最近收藏失败已复制，共 ${records.length} 条。`);
      const exportEl = document.querySelector("#baf-recent-export");
      if (exportEl) exportEl.textContent = `最近导出：收藏失败 ${records.length} 条`;
    });
    panel.querySelector("#baf-open-failure")?.addEventListener("click", openRecentFavoriteFailure);
    panel.querySelector("#baf-back-search")?.addEventListener("click", backToSearchList);
    panel.querySelector("#baf-clear-failures")?.addEventListener("click", () => {
      if (!window.confirm("确认清空收藏失败记录？")) return;
      clearFavoriteFailures();
    });
    panel.querySelector("#baf-copy-runtime-log")?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(runtimeLogText());
      debugLog("runtime_log_copy");
      updateStatus(statusSummary(`运行日志已复制，共 ${state.debugLogs.length} 条。`));
    });
    panel.querySelector("#baf-clear-runtime-log")?.addEventListener("click", () => {
      if (!window.confirm("确认清空运行日志吗？")) return;
      clearRuntimeLogs();
      updateStatus(statusSummary("运行日志已清空。"));
    });
    panel.querySelector("#baf-debug").addEventListener("click", async () => {
      debugLog("diagnostics_copy");
      await navigator.clipboard.writeText(diagnosticsJson());
      updateStatus(statusSummary(`诊断日志已复制，共 ${state.debugLogs.length} 条。`));
    });
    panel.querySelector("#baf-copy-config")?.addEventListener("click", async () => {
      readPanelConfig();
      await navigator.clipboard.writeText(JSON.stringify(configSchemaSnapshot(), null, 2));
      updateStatus(statusSummary("当前配置已复制。"));
    });
    panel.querySelector("#baf-clear").addEventListener("click", () => {
      if (!window.confirm("确认清空已保存的岗位表格记录？")) return;
      state.records = [];
      saveRecords();
      updatePanel();
      updateStatus("表格记录已清空。");
    });
    panel.querySelector("#baf-feedback-wide").addEventListener("click", () => {
      const next = adjustThreshold(5);
      updateStatus(statusSummary(`已提高收藏分到 ${next}，下次会更严格。`));
    });
    panel.querySelector("#baf-feedback-narrow").addEventListener("click", () => {
      const next = adjustThreshold(-5);
      updateStatus(statusSummary(`已降低收藏分到 ${next}，下次会更宽松。`));
    });
    panel.querySelector("#baf-apply-feedback").addEventListener("click", applyFeedbackWords);
    panel.querySelector("#baf-generate-rules").addEventListener("click", async () => {
      if (!ensureAiKeyBeforeAction("生成加分词/排除词")) return;
      await generateRulesFromPanelKeywords();
    });
    updateConfigSummary();
  }

  function updateStatus(text) {
    const el = document.querySelector("#baf-status");
    if (el) el.textContent = text;
    updateTodayProgress();
    updateRunStateIndicator();
  }

  function mergeTextareaWords(selector, words) {
    const el = document.querySelector(selector);
    if (!el) return;
    const merged = parseKeywordList(`${el.value || ""}\n${(words || []).join("\n")}`);
    el.value = merged.join("\n");
  }

  function setNote(selector, text) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "block" : "none";
  }

  function updateAiKeyState(text) {
    const el = document.querySelector("#baf-ai-key-state");
    if (!el) return;
    const keyValue = String(document.querySelector("#baf-ai-key")?.value || "").trim();
    const hasTypedRealKey = Boolean(keyValue && !isMaskedApiKey(keyValue));
    el.textContent = text || (hasTypedRealKey ? "待保存" : state.aiSettings.hasKey ? "已保存" : "未保存");
    el.classList.toggle("baf-ai-key-state-ok", state.aiSettings.hasKey && !hasTypedRealKey && !text);
    el.classList.toggle("baf-ai-key-state-pending", hasTypedRealKey || Boolean(text));
  }

  function resetRulesForNewProfile() {
    setPanelValue("#baf-positive", "");
    setPanelValue("#baf-negative", "");
    config.filters.customPositive = [];
    config.filters.customNegative = [];
    state.aiStrategy = null;
    saveAiStrategy();
    updateConfigSummary();
  }

  function profileNotePrefix() {
    const profile = keywordProfileFromPanel();
    const targetPreview = profile.targets.slice(0, 5).join("、") || "不限";
    return `${profile.natureText || "不限"} + ${targetPreview}`;
  }

  function extractJsonBlock(text) {
    const raw = String(text || "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    return first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
  }

  function repairJsonText(text) {
    return String(text || "")
      .replace(/\u0000/g, "")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, "$1");
  }

  function parseAiArrayField(text, fieldName) {
    const raw = String(text || "");
    const match = raw.match(new RegExp(`"${fieldName}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, "i"));
    if (!match) return [];
    const items = [];
    const itemRegex = /"((?:\\.|[^"\\])*)"/g;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(match[1])) !== null) {
      try {
        items.push(JSON.parse(`"${itemMatch[1]}"`));
      } catch (_) {
        items.push(itemMatch[1]);
      }
    }
    return items;
  }

  function extractJsonArrayField(text, fieldName) {
    const raw = String(text || "");
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, "i");
    const match = raw.match(pattern);
    if (!match) return [];
    const items = [];
    const itemRegex = /"((?:\\.|[^"\\])*)"/g;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(match[1])) !== null) {
      try {
        items.push(JSON.parse(`"${itemMatch[1]}"`));
      } catch (_) {
        items.push(itemMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
      }
    }
    return items;
  }

  function firstAiArrayField(source, fieldNames) {
    for (const name of fieldNames) {
      const direct = Array.isArray(source?.[name]) ? source[name] : [];
      if (direct.length) return direct;
    }
    return [];
  }

  function aiArrayItemsToStrings(items) {
    if (!Array.isArray(items)) return [];
    const textKeys = ["word", "keyword", "text", "name", "title", "value", "label"];
    return items
      .map((item) => {
        if (typeof item === "string" || typeof item === "number") return String(item);
        if (!item || typeof item !== "object") return "";
        for (const key of textKeys) {
          if (typeof item[key] === "string" || typeof item[key] === "number") return String(item[key]);
        }
        return "";
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function findAiArrayField(source, fieldNames, seen = new Set()) {
    if (!source || typeof source !== "object" || seen.has(source)) return [];
    seen.add(source);
    for (const name of fieldNames) {
      const direct = aiArrayItemsToStrings(source[name]);
      if (direct.length) return direct;
    }
    const children = Array.isArray(source) ? source : Object.values(source);
    for (const child of children) {
      const nested = findAiArrayField(child, fieldNames, seen);
      if (nested.length) return nested;
    }
    return [];
  }

  function aiObjectShape(source, depth = 0, seen = new Set()) {
    if (!source || typeof source !== "object" || seen.has(source) || depth > 2) return [];
    seen.add(source);
    const rows = [];
    const entries = Array.isArray(source) ? source.slice(0, 3).map((value, index) => [String(index), value]) : Object.entries(source).slice(0, 12);
    for (const [key, value] of entries) {
      if (Array.isArray(value)) {
        rows.push(`${key}:array(${value.length})`);
      } else if (value && typeof value === "object") {
        rows.push(`${key}:object`);
        rows.push(...aiObjectShape(value, depth + 1, seen).map((item) => `${key}.${item}`));
      } else {
        rows.push(`${key}:${typeof value}`);
      }
    }
    return rows.slice(0, 40);
  }

  function firstAiArrayTextField(text, fieldNames) {
    for (const name of fieldNames) {
      const items = parseAiArrayField(text, name);
      if (items.length) return items;
    }
    return [];
  }

  function parseAiJson(content) {
    const raw = extractJsonBlock(content);
    try {
      return JSON.parse(raw);
    } catch (_) {
      return JSON.parse(repairJsonText(raw));
    }
  }

  function aiConfigured() {
    return Boolean(String(document.querySelector("#baf-ai-key")?.value || "").trim() || state.aiSettings.hasKey);
  }

  function alertMissingAiKey(actionText) {
    const message = `请先在「高级规则」中填入第三方大模型key，再${actionText}。`;
    const existing = document.querySelector("#baf-missing-key-modal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = "baf-missing-key-modal";
    modal.className = "baf-missing-key-modal";
    modal.innerHTML = `
      <div class="baf-missing-key-dialog" role="alertdialog" aria-modal="true" aria-labelledby="baf-missing-key-title">
        <div id="baf-missing-key-title" class="baf-missing-key-title">需要第三方大模型key</div>
        <div class="baf-missing-key-text">${escapeHtml(message)}</div>
        <button id="baf-missing-key-close" type="button">知道了</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector("#baf-missing-key-close")?.addEventListener("click", () => modal.remove(), { once: true });
    modal.addEventListener("click", event => {
      if (event.target === modal) modal.remove();
    });
  }

  async function callDeepSeek(messages, maxTokens = 1400) {
    readPanelConfig();
    await saveAiSettings();
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        reject(new Error("当前扩展环境不支持后台请求"));
        return;
      }
      chrome.runtime.sendMessage({
        type: "deepseek-chat",
        model: state.aiSettings.model || "deepseek-v4-flash",
        messages,
        maxTokens
      }, response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "DeepSeek 调用失败"));
          return;
        }
        resolve(response.content);
      });
    });
  }

  function aiProfilePayload() {
    const profile = keywordProfileFromPanel();
    const currentKeywords = parseKeywordList(document.querySelector("#baf-keywords")?.value || "");
    const screeningStrategy = screeningStrategySnapshot();
    return {
      jobNature: profile.natureText || config.filters.jobNature || "不限",
      normalizedNature: profile.nature,
      targetDirections: profile.targets,
      screeningStrategy,
      configSummary: configSummaryText(),
      salary: {
        minK: document.querySelector("#baf-salary-min")?.value || "",
        maxK: document.querySelector("#baf-salary-max")?.value || ""
      },
      currentSearchKeywords: currentKeywords,
      likedWords: state.userPrefs.likedWords || [],
      dislikedWords: state.userPrefs.dislikedWords || []
    };
  }

  function sanitizeAiWords(words, limit = 40) {
    return [...new Set((words || [])
      .map(word => norm(String(word || "")))
      .filter(word => word && word.length <= 28 && !/[。！？]/.test(word)))]
      .slice(0, limit);
  }

  function sanitizePositiveWordsByNature(words, limit = 60) {
    const nature = resolveJobNature(config.filters.jobNature || "");
    const businessMarkers = ["销售", "商务", "BD", "bd", "客户", "大客户", "渠道", "经理", "顾问", "售前", "解决方案", "方案", "项目"];
    const techOnlyMarkers = ["编程", "调试", "算法", "开发", "研发", "测试", "运维", "训练", "标注"];
    return sanitizeAiWords(words, limit).filter(word => {
      if (nature === "tech") return true;
      const hasTechOnly = techOnlyMarkers.some(marker => word.includes(marker));
      if (!hasTechOnly) return true;
      return businessMarkers.some(marker => word.includes(marker));
    });
  }

  function sanitizeAiTextList(words, limit = 20) {
    return [...new Set((words || [])
      .map(word => norm(String(word || "")))
      .filter(Boolean))]
      .slice(0, limit);
  }

  function normalizeAiScreeningStrategy(parsed) {
    const source = parsed?.screening_strategy || {};
    const local = screeningStrategySnapshot();
    return {
      target: local.target,
      mustHave: sanitizeAiTextList(source.must_have || source.mustHave || local.mustHave, 8),
      acceptable: sanitizeAiTextList(source.acceptable || local.acceptable, 8),
      reviewOnly: sanitizeAiTextList(source.review_only || source.reviewOnly || local.reviewOnly, 8),
      directExclude: filterConflictingNegativeWords(sanitizeAiWords(source.direct_exclude || source.directExclude || local.directExclude, RULE_SEED_LIMIT)),
      positiveReference: sanitizePositiveWordsByNature(source.positive_reference || source.positiveReference || local.positiveReference, RULE_SEED_LIMIT),
      scoring: {
        favoriteScore: Number(source.scoring?.favorite_score || source.scoring?.favoriteScore || config.threshold || 60),
        reviewScore: Number(source.scoring?.review_score || source.scoring?.reviewScore || REVIEW_THRESHOLD),
        excludeBelow: Number(source.scoring?.exclude_below || source.scoring?.excludeBelow || REVIEW_THRESHOLD),
        broadTargetPolicy: norm(source.scoring?.broad_target_policy || source.scoring?.broadTargetPolicy || local.scoring.broadTargetPolicy)
      },
      salary: local.salary,
      safety: local.safety,
      boundary: local.boundary,
      generatedBy: "deepseek"
    };
  }

  function buildAiSummaryText(parsed, strategy) {
    const directions = strategy.target.directions.slice(0, 6).join("、") || "未填写";
    const positive = strategy.positiveReference.slice(0, RULE_SEED_LIMIT).join("、") || "按岗位性质和目标方向自动加分";
    const negative = strategy.directExclude.slice(0, RULE_SEED_LIMIT).join("、") || "无明确直接排除词；边界岗位先进待复核";
    return [
      `配置来源：DeepSeek 已生成，已做目标方向冲突清洗。`,
      `我要找：${strategy.target.jobNature} + ${directions}`,
      `必须满足：${strategy.mustHave.join("；")}。`,
      `可以接受：${strategy.acceptable.join("；")}。`,
      `待复核：${(strategy.reviewOnly || []).slice(0, 4).join("；") || "边界岗位人工确认"}。`,
      `直接排除：${negative}`,
      `收藏策略：${strategy.scoring.favoriteScore}分以上收藏，${strategy.scoring.reviewScore}-${strategy.scoring.favoriteScore - 1}分待复核，低于${strategy.scoring.reviewScore}分跳过。`,
      `加分参考：${positive}`,
      `安全限制：今日最多扫${strategy.safety.dailyScanLimit || "不限"}，今日最多藏${strategy.safety.dailyFavoriteLimit || "不限"}，每扫${strategy.safety.pauseEvery}个休息${strategy.safety.pauseRangeSec[0]}-${strategy.safety.pauseRangeSec[1]}秒。`,
      `使用边界：${strategy.boundary}；遇到验证或账号异常立即停止。`
    ].join("\n");
  }

  function applyAiStrategy(parsed) {
    const strategy = normalizeAiScreeningStrategy(parsed);
    state.aiStrategy = {
      ruleVersion: RULE_VERSION,
      profileKey: strategyProfileKey(),
      createdAt: new Date().toISOString(),
      strategy,
      summaryText: buildAiSummaryText(parsed, strategy)
    };
    saveAiStrategy();
    updateConfigSummary();
  }

  async function generateSearchKeywordsWithAi() {
    if (!aiConfigured()) return null;
    const payload = aiProfilePayload();
    const messages = [
      {
        role: "system",
        content: [
          "你是招聘网站搜索标题词专家，服务对象是普通求职者。",
          "本任务只负责生成“搜索标题词”，目标是覆盖 HR 在 BOSS 直聘里真实会写的岗位标题和相邻叫法，不负责生成正向词/反向词。",
          "只输出严格 JSON，不要解释。",
          "必须先在 JSON 的 analysis 字段里做简短判断：岗位性质是什么、目标方向对应哪些产品/行业/场景、HR 可能怎么写标题、哪些相邻标题值得搜。",
          "搜索词规则：数量 12-18 个；必须是可直接放进 BOSS 搜索框的岗位标题关键词；按优先级排序；不要只机械拼“目标方向 + 岗位性质”。",
          "搜索词要覆盖 3 类：1. 用户直写目标词 + 岗位性质；2. HR 常见同义标题；3. 目标方向的相邻产品或行业叫法。",
          "例子：岗位性质=销售，目标方向=ai应用时，除 ai应用销售 外，还应联想到 Agent销售、智能体销售、AI软件销售、AI SaaS销售、AI解决方案销售、AI产品销售、大模型销售、AIGC销售、智能客服销售、AI知识库销售。",
          "例子：岗位性质=运营，目标方向=ai教育时，可生成 ai教育运营、ai教育客户运营、ai教育用户运营、ai教育增长运营、ai教育平台运营、ai教育产品运营等，但不要生成 AI应用销售。",
          "禁止输出 ai、互联网、软件、企业服务、运营、销售 这类过泛单词；禁止输出纯技能词、行业概念词或不能当岗位标题搜索的词。",
          "必须同时生成 config_summary 和 screening_strategy，但其中正向/反向只是摘要参考：正向参考最多 5 个评分锚点，直接排除最多 5 个明显不想看的岗位类型。",
          "收藏策略：favorite_score 使用 input.screeningStrategy.scoring.favoriteScore；review_score 固定 50；50 分以下跳过。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          input: payload,
          output_format: {
            analysis: {
              role_nature: "岗位性质分析",
              target_domain: "目标方向分析",
              hr_title_logic: "HR 可能使用哪些岗位标题",
              adjacent_title_logic: "哪些相邻产品或标题值得一起搜索",
              not_rule_words: "说明这些不是正向词/反向词，只是搜索标题词"
            },
            search_keywords: ["搜索标题词1", "搜索标题词2", "至少12个，最多18个"],
            config_summary: "面板展示用配置摘要，按我要找、必须满足、可以接受、待复核、直接排除、收藏策略、加分参考、安全限制、使用边界分行输出",
            screening_strategy: {
              must_have: ["必须满足1"],
              acceptable: ["可以接受1"],
              review_only: ["需要人工复核1"],
              direct_exclude: ["明显不想看的岗位类型，最多5个"],
              positive_reference: ["评分锚点，最多5个，不复制搜索标题词列表"],
              scoring: {
                favorite_score: 60,
                review_score: 50,
                exclude_below: 50,
                broad_target_policy: "泛词只进复核"
              }
            },
            manual_review_tip: "提醒用户生成后先手动删减和补充关键词",
            note: "给用户的简短提醒"
          }
        })
      }
    ];
    const content = await callDeepSeek(messages, 1100);
    let parsed;
    let keywords = [];
    try {
      parsed = parseAiJson(content);
      keywords = sanitizeAiWords(firstAiArrayField(parsed, ["search_keywords", "keywords", "search_terms", "queries", "titles", "job_titles", "搜索词", "搜索标题词", "关键词"]), 30);
    } catch (_) {
      keywords = sanitizeAiWords(firstAiArrayTextField(content, ["search_keywords", "keywords", "search_terms", "queries", "titles", "job_titles", "搜索词", "搜索标题词", "关键词"]), 30);
    }
    if (!keywords.length) {
      debugLog("generate_keywords_no_keywords", {
        parsedKeys: parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 12) : [],
        rawPreview: String(content || "").replace(/\s+/g, " ").trim().slice(0, 260)
      });
      throw new Error("DeepSeek 没有返回有效搜索词");
    }
    if (parsed) applyAiStrategy(parsed);
    const note = parsed ? String(parsed.note || parsed.manual_review_tip || "").replace(/[\r\n]+/g, " ").replace(/["'`]/g, "").slice(0, 120) : "";
    return { keywords, note };
  }

  async function generateRulesWithAi() {
    if (!aiConfigured()) return null;
    const profile = aiProfilePayload();
    const keywords = parseKeywordList(document.querySelector("#baf-keywords")?.value || "");
    const messages = [
      {
        role: "system",
        content: [
          "你是招聘岗位评分锚点专家。",
          "本任务只负责生成“评分/排除锚点”，不要再生成搜索标题词。",
          "目标：根据岗位性质、目标方向、用户已优化的搜索标题词、配置摘要，生成少量、精准、可人工继续优化的加分词和排除词。",
          "只输出严格 JSON，不要解释。",
          "必须遵守 input.screeningStrategy 和 input.configSummary。",
          "先在 analysis 字段里判断：用户要找的岗位性质、目标行业/产品、哪些词适合作为加分锚点、哪些岗位类型应该排除。",
          "加分词规则：只输出 3-5 个评分锚点，必须紧贴“岗位性质 + 目标方向”。它们用于判断岗位是否更相关，不是搜索词列表，不要复制 optimizedSearchKeywords。",
          "加分词可以是目标产品/场景词、岗位性质词、少量强相关组合词。例如销售+ai应用可用 AI应用、Agent、AI软件、AI SaaS、解决方案销售；运营+ai教育可用 ai教育运营、用户运营、增长运营、平台运营、产品运营。",
          "不要输出 To B、企业服务、产品演示、商务谈判这类泛泛加分词，除非它们就是用户目标方向。",
          "排除词规则：只输出 3-5 个用户明显不想看的岗位类型，例如保险、贷款、营业员、招生、课程销售、电话销售。不要输出行业技术词、硬件词、算力、GPU、CPU、金融线这类大词库词。",
          "关键例子：目标方向=机器人时，不要把 机器人硬件、人形机器人、工业机器人、协作机器人 放进 negative_keywords；如果不确定，放进 review_only，不要放排除词。",
          "输出数量：positive_keywords 3-5 个，negative_keywords 3-5 个，review_only 0-5 个。少而准，按重要度排序。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          input: {
            ...profile,
            optimizedSearchKeywords: keywords,
            existingPositive: parseKeywordList(document.querySelector("#baf-positive")?.value || ""),
            existingNegative: parseKeywordList(document.querySelector("#baf-negative")?.value || "")
          },
          output_format: {
            analysis: {
              role_nature: "岗位性质分析",
              target_domain: "目标方向分析",
              positive_logic: "加分词生成逻辑",
              negative_logic: "排除词生成逻辑"
            },
            positive_keywords: ["加分词1", "加分词2", "最多5个"],
            negative_keywords: ["排除词1", "排除词2", "最多5个"],
            review_only: ["边界词1"],
            note: "给用户的简短提醒"
          }
        })
      }
    ];
    const content = await callDeepSeek(messages, 700);
    let parsed;
    let positive = [];
    let negative = [];
    const positiveFieldNames = [
      "positive_keywords",
      "positive",
      "include_keywords",
      "bonus_words",
      "positive_reference",
      "must_have",
      "recommended_keywords",
      "include",
      "match_keywords",
      "加分词",
      "正向词"
    ];
    const negativeFieldNames = [
      "negative_keywords",
      "negative",
      "exclude_keywords",
      "exclude_words",
      "direct_exclude",
      "hard_exclude",
      "exclude",
      "blocked_keywords",
      "排除词",
      "反向词"
    ];
    try {
      parsed = parseAiJson(content);
      positive = sanitizePositiveWordsByNature(findAiArrayField(parsed, positiveFieldNames), RULE_SEED_LIMIT);
      negative = filterConflictingNegativeWords(sanitizeAiWords(findAiArrayField(parsed, negativeFieldNames), RULE_SEED_LIMIT));
    } catch (_) {
      positive = sanitizePositiveWordsByNature(firstAiArrayTextField(content, positiveFieldNames), RULE_SEED_LIMIT);
      negative = filterConflictingNegativeWords(sanitizeAiWords(firstAiArrayTextField(content, negativeFieldNames), RULE_SEED_LIMIT));
    }
    if (!positive.length && !negative.length) {
      debugLog("generate_rules_no_keywords", {
        parsedKeys: parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 12) : [],
        parsedShape: aiObjectShape(parsed),
        rawPreview: String(content || "").replace(/\s+/g, " ").trim().slice(0, 260)
      });
      throw new Error("DeepSeek 没有返回有效规则词");
    }
    const note = parsed ? String(parsed.note || "").replace(/[\r\n]+/g, " ").replace(/["'`]/g, "").slice(0, 120) : "";
    return { positive, negative, note };
  }

  async function generateSearchKeywordsFromProfile() {
    resetRulesForNewProfile();
    if (!aiConfigured()) {
      const message = "未保存第三方大模型key，无法生成搜索词。请先在高级规则中填写并保存 Key。";
      alertMissingAiKey("生成搜索词");
      setNote("#baf-keyword-note", message);
      updateStatus(statusSummary(message));
      debugLog("generate_keywords_blocked_missing_ai_key");
      return false;
    }
    try {
      updateStatus(statusSummary("DeepSeek 正在生成搜索词..."));
      const aiResult = await generateSearchKeywordsWithAi();
      const generated = [...new Set(aiResult.keywords)].slice(0, 18);
      const aiNote = aiResult.note;
      if (!generated.length) {
        throw new Error("DeepSeek 没有返回有效搜索词");
      }
      setPanelValue("#baf-keywords", generated.join("\n"));
      setPanelChecked("#baf-expand-keywords", true);
      readPanelConfig();
      setNote(
        "#baf-keyword-note",
        `已用 DeepSeek 按「${profileNotePrefix()}」生成 ${generated.length} 个搜索词。\n${aiNote ? `${aiNote}\n` : ""}重要：先人工确认这一框，删掉不想看的词，补上你知道的岗位叫法；确认后再生成加分词/排除词。第一次每词先跑 100-200。`
      );
      updateStatus(statusSummary(`DeepSeek 已生成搜索词：${generated.length} 个。`));
      return true;
    } catch (error) {
      const message = `DeepSeek 生成搜索词失败：${String(error?.message || error)}`;
      setNote("#baf-keyword-note", `${message}\n不会改用本地规则，请检查 API Key、模型或网络后重试。`);
      updateStatus(statusSummary("DeepSeek 生成搜索词失败，未使用本地规则兜底。"));
      debugLog("generate_keywords_llm_failed", { error: String(error?.message || error) });
      return false;
    }
  }

  async function generateRulesFromPanelKeywords(options = {}) {
    const positiveEl = document.querySelector("#baf-positive");
    const negativeEl = document.querySelector("#baf-negative");
    const hasManualRules = parseKeywordList(`${positiveEl?.value || ""}\n${negativeEl?.value || ""}`).length > 0;
    if (options.onlyIfEmpty && hasManualRules) return false;
    const keywords = parseKeywordList(document.querySelector("#baf-keywords")?.value || "");
    if (!keywords.length && !options.allowEmpty) {
      setNote("#baf-rules-note", "先生成或填写搜索词，并手动删改后，再生成加分词/排除词。");
      updateStatus(statusSummary("缺少搜索词，暂时不能生成规则。"));
      return false;
    }
    if (!aiConfigured()) {
      const message = "未保存第三方大模型key，无法生成加分词/排除词。请先在高级规则中填写并保存 Key。";
      alertMissingAiKey("生成加分词/排除词");
      setNote("#baf-rules-note", message);
      updateStatus(statusSummary(message));
      debugLog("generate_rules_blocked_missing_ai_key");
      return false;
    }
    let generated = null;
    let aiNote = "";
    try {
      updateStatus(statusSummary("DeepSeek 正在生成加分词/排除词..."));
      const aiResult = await generateRulesWithAi();
      generated = { positive: aiResult.positive, negative: aiResult.negative };
      aiNote = aiResult.note;
    } catch (error) {
      const message = `DeepSeek 生成加分词/排除词失败：${String(error?.message || error)}`;
      setNote("#baf-rules-note", `${message}\n不会改用本地规则，请检查 API Key、模型或网络后重试。`);
      updateStatus(statusSummary("DeepSeek 生成加分词/排除词失败，未使用本地规则兜底。"));
      debugLog("generate_rules_llm_failed", { error: String(error?.message || error) });
      return false;
    }
    mergeTextareaWords("#baf-positive", generated.positive);
    mergeTextareaWords("#baf-negative", generated.negative);
    readPanelConfig();
    setNote(
      "#baf-rules-note",
      `已用 DeepSeek 按「${profileNotePrefix()}」生成少量种子词：加分 ${generated.positive.length} 个、排除 ${generated.negative.length} 个。\n${aiNote ? `${aiNote}\n` : ""}建议手动看一眼：加分词只保留最贴近目标的岗位叫法；排除词只放明显不想看的岗位类型。`
    );
    if (!options.silent) {
      updateStatus(statusSummary(`已生成加分词/排除词：加分 ${generated.positive.length} 个，排除 ${generated.negative.length} 个。`));
    }
    return true;
  }

  function adjustThreshold(delta) {
    const el = document.querySelector("#baf-threshold");
    const current = Number(el?.value || config.threshold || 60);
    const next = Math.max(40, Math.min(95, current + delta));
    if (el) el.value = next;
    readPanelConfig();
    return next;
  }

  function showFeedbackPanel(message = "任务已完成，可以做一次整体反馈。") {
    const panel = document.querySelector("#baf-feedback");
    if (panel) panel.style.display = "block";
    updateStatus(statusSummary(message));
  }

  function runStateInfo() {
    const latest = state.logs[0] || null;
    const hasError = latest?.action === "error" || /failed|error/.test(String(state.campaign?.phase || ""));
    if (state.running) {
      return { code: "running", text: "绿灯｜运行中" };
    }
    if (state.campaign?.paused || hasError) {
      return { code: "error", text: "红灯｜暂停/报错" };
    }
    if (state.campaign && !state.campaign.active && !state.campaign.paused && Number(state.campaign.index || 0) >= Number((state.campaign.keywords || []).length || 0)) {
      return { code: "complete", text: "黄灯｜已完成" };
    }
    return { code: "idle", text: "灰灯｜未启动" };
  }

  function updateRunStateIndicator() {
    const indicator = document.querySelector("#baf-run-state");
    const text = document.querySelector("#baf-run-text");
    if (!indicator || !text) return;
    const info = runStateInfo();
    indicator.classList.remove("baf-state-idle", "baf-state-running", "baf-state-error", "baf-state-complete");
    indicator.classList.add(`baf-state-${info.code}`);
    text.textContent = info.text;
    indicator.title = info.text;
  }

  function applyFeedbackWords() {
    const moreWords = parseKeywordList(document.querySelector("#baf-more-words")?.value || "");
    const lessWords = parseKeywordList(document.querySelector("#baf-less-words")?.value || "");
    if (moreWords.length) {
      mergeTextareaWords("#baf-positive", moreWords);
      mergeTextareaWords("#baf-keywords", moreWords);
    }
    if (lessWords.length) {
      mergeTextareaWords("#baf-negative", lessWords);
    }
    state.userPrefs.likedWords = [...new Set([...(state.userPrefs.likedWords || []), ...moreWords])];
    state.userPrefs.dislikedWords = [...new Set([...(state.userPrefs.dislikedWords || []), ...lessWords])];
    state.userPrefs.feedbackHistory = [
      ...(state.userPrefs.feedbackHistory || []),
      { time: new Date().toISOString(), likedWords: moreWords, dislikedWords: lessWords, threshold: config.threshold }
    ].slice(-80);
    saveUserPrefs();
    readPanelConfig();
    const moreInput = document.querySelector("#baf-more-words");
    const lessInput = document.querySelector("#baf-less-words");
    if (moreInput) moreInput.value = "";
    if (lessInput) lessInput.value = "";
    updateStatus(statusSummary(`已应用反馈：新增想多看 ${moreWords.length} 个，不想看 ${lessWords.length} 个。`));
  }

  function updatePanel() {
    updateTodayProgress();
    updateRunStateIndicator();
    const setText = (selector, text) => {
      const el = document.querySelector(selector);
      if (el) el.textContent = text;
    };
    const panel = document.querySelector("#boss-ai-autofav-panel");
    const paused = Boolean(state.campaign?.paused);
    panel?.classList.toggle("baf-running", state.running);
    panel?.classList.toggle("baf-paused", !state.running && paused);
    const startButton = document.querySelector("#baf-start");
    const stopButton = document.querySelector("#baf-stop");
    if (startButton) {
      const mode = panel?.dataset.scanMode || "current";
      startButton.disabled = Boolean(state.running);
      startButton.textContent = state.running
        ? "扫描中..."
        : paused
          ? "启动/继续"
          : mode === "task"
            ? "启动/继续"
            : "开始扫描";
    }
    if (stopButton) {
      stopButton.disabled = !state.running && !paused;
      stopButton.textContent = paused ? "已暂停" : "暂停";
    }
    const decisionItems = recentDecisionItems();
    const recent = decisionItems[0] || null;
    setText("#baf-current-action-text", state.running
      ? "正在扫描岗位"
      : state.campaign?.paused
        ? "已暂停，等待继续"
        : "等待开始扫描");
    setText("#baf-last-result", recent
      ? `最近结果：${actionLabel(recent.action)}｜${recent.score}分｜${recent.title || ""}`
      : "最近结果：还没有岗位结果");
    updateRuntimeLogPreview();
    setText("#baf-failure-count", `${favoriteFailureRecords().length} 条`);
    setText("#baf-protection-text", `本次 ${state.scanned}｜藏 ${state.favorited}｜复 ${state.reviewed}｜跳 ${state.skipped}｜错 ${state.errors}｜今日扫 ${state.daily.scanned}/${config.safety.dailyScanLimit || "不限"}｜藏 ${state.daily.favorited}/${config.safety.dailyFavoriteLimit || "不限"}｜招呼 ${state.daily.greeted || 0}/${config.greeting?.dailyLimit || "不限"}`);
    const box = document.querySelector("#baf-log");
    if (!box) return;
    const actionClass = action => {
      if (action === "favorite") return "favorite";
      if (action === "review" || action === "favorite_failed") return "review";
      if (action === "exclude") return "exclude";
      return "skip";
    };
    const filteredLogs = decisionItems
      .filter(r => state.logFilter === "all" || logStatus(r) === state.logFilter)
      .slice(0, 18);
    if (!filteredLogs.length) {
      box.innerHTML = `<div class="baf-empty">还没有${state.logFilter === "all" ? "" : "对应状态的"}判断记录。</div>`;
      return;
    }
    box.innerHTML = filteredLogs.map(r => {
      const hits = (r.hits || []).slice(0, 5).join("、") || "-";
      const negatives = (r.negatives || []).slice(0, 4).join("、") || "-";
      const reviewNotes = (r.reviewNotes || []).slice(0, 2).join("、");
      return `
      <div class="baf-item">
        <div><span class="baf-action ${actionClass(r.action)}">${escapeHtml(actionLabel(r.action))}</span> ${escapeHtml(r.score)}分｜${escapeHtml(r.title)}</div>
        ${r.mainReason ? `<div class="baf-small">原因：${escapeHtml(r.mainReason)}</div>` : ""}
        <div class="baf-small">命中：${escapeHtml(hits)}</div>
        <div class="baf-small">扣分：${escapeHtml(negatives)}</div>
        ${r.detailMatched || r.detailChanged || r.detailHrefMatched ? `<div class="baf-small">详情：匹配 ${escapeHtml(r.detailMatched || "-")}｜切换 ${escapeHtml(r.detailChanged || "-")}｜链接 ${escapeHtml(r.detailHrefMatched || "-")}</div>` : ""}
        ${reviewNotes ? `<div class="baf-small">复核：${escapeHtml(reviewNotes)}</div>` : ""}
        ${r.decisionLog ? `<div class="baf-small">决策：${escapeHtml(r.decisionLog)}</div>` : ""}
        ${r.favoriteResult ? `<div class="baf-small">收藏：${escapeHtml(r.favoriteResult)}</div>` : ""}
        ${r.greetingResult ? `<div class="baf-small">招呼：${escapeHtml(r.greetingResult)}</div>` : ""}
      </div>
    `;
    }).join("");
  }

  async function processJob(job) {
    debugLog("process_job_start", { title: job.title, href: job.href });
    job.card.scrollIntoView({ block: "center", inline: "nearest" });
    await sleep(250);
    const beforeDetail = detailSnapshot();
    const clickResult = clickJobCard(job);
    debugLog("job_card_clicked", {
      title: job.title,
      href: job.href,
      clickMethod: clickResult.method,
      clickHref: clickResult.href,
      beforeSignature: beforeDetail.signature
    });
    let detailResult = await waitForJobDetail(job, beforeDetail.signature, Math.max(6000, jitter() + 1800));
    if (!detailResult.ok) {
      job.card.scrollIntoView({ block: "center", inline: "nearest" });
      await sleep(350);
      const retryClickResult = clickJobCard(job);
      debugLog("job_detail_retry_click", {
        title: job.title,
        href: job.href,
        clickMethod: retryClickResult.method,
        clickHref: retryClickResult.href,
        firstResult: detailLogPayload(detailResult)
      });
      detailResult = await waitForJobDetail(job, beforeDetail.signature, Math.max(4500, jitter() + 1500));
    }
    if (!detailResult.ok) {
      debugLog("job_detail_not_confirmed", {
        title: job.title,
        href: job.href,
        beforeSignature: beforeDetail.signature,
        afterSignature: detailResult.signature,
        matched: detailResult.matched,
        matchReason: detailResult.matchReason,
        hrefMatched: detailResult.hrefMatched,
        selected: detailResult.selected,
        detail: detailLogPayload(detailResult)
      });
      throw new JobDetailNotConfirmedError("未确认右侧详情已切换到当前岗位，已暂停，避免使用旧详情判断", {
        beforeSignature: beforeDetail.signature,
        afterSignature: detailResult.signature,
        matchReason: detailResult.matchReason,
        hrefMatched: detailResult.hrefMatched,
        selected: detailResult.selected,
        detail: detailLogPayload(detailResult)
      });
    }
    const detail = detailResult.text;
    const combined = `${job.title} ${job.cardText} ${detail}`;
    const localResult = scoreJob(combined);
    const filterResult = evaluateFilters(combined);
    const llmResult = await judgeJobWithLlm(job, detail, localResult, filterResult);
    const record = {
      time: new Date().toISOString(),
      title: job.title,
      href: job.href,
      cardText: job.cardText,
      detailMatched: detailResult.matched ? `是：${detailResult.matchReason || "标题"}` : "否",
      detailChanged: detailResult.changed ? "是" : "否",
      detailHrefMatched: detailResult.hrefMatched ? "是" : "否",
      companyScale: currentCompanyScaleLabel(),
      score: llmResult.score,
      hits: llmResult.hits,
      negatives: llmResult.negatives,
      filterNotes: llmResult.filterNotes,
      reviewNotes: llmResult.reviewNotes || [],
      action: "exclude",
      ruleVersion: RULE_VERSION,
      needsReview: false,
      mainReason: llmResult.mainReason,
      decisionLog: llmResult.decisionLog,
      recommendedAction: llmResult.recommendedAction
    };
    const blocked = llmResult.hardExcluded || filterResult.hardExcluded;
    const blockReason = blocked
      ? `LLM 或过滤规则判定排除:${llmResult.negatives.slice(0, 3).join("、") || "未记录"}`
      : "";
    const shouldFavorite = llmResult.action === "favorite" && !blocked;
    const shouldReview = llmResult.action === "review" && !blocked;
    let decisionContext = { blocked, blockReason };
    if (shouldFavorite && favoriteLimitReached()) {
      record.filterNotes.push(`达到今日收藏安全上限 ${config.safety.dailyFavoriteLimit}`);
      record.action = "review";
      record.needsReview = true;
      record.recommendedAction = "人工复核，今日收藏达到安全上限";
      decisionContext.reviewReason = `达到收藏线，但今日收藏达到安全上限 ${config.safety.dailyFavoriteLimit}，转待复核`;
      state.reviewed += 1;
    } else if (shouldFavorite) {
      const fav = await clickFavoriteButton();
      record.favoriteResult = fav.status;
      record.favoriteButtonText = fav.text;
      record.action = fav.ok ? "favorite" : "favorite_failed";
      record.needsReview = !fav.ok;
      decisionContext.reviewReason = fav.ok ? "" : "达到收藏线，但点击后未确认收藏状态，转待复核";
      if (record.action === "favorite") {
        state.favorited += 1;
        state.daily.favorited += 1;
        try {
          record.greetingResult = await tryAutoGreeting(job, record);
        } catch (error) {
          record.greetingResult = `自动打招呼失败：${String(error?.message || error)}`;
          debugLog("auto_greeting_error", { title: job.title, href: job.href, error: record.greetingResult });
        }
      } else {
        state.reviewed += 1;
      }
    } else if (shouldReview) {
      record.action = "review";
      record.needsReview = true;
      record.recommendedAction = record.recommendedAction || "人工复核";
      decisionContext.reviewReason = llmResult.decisionLog || "LLM 建议人工复核";
      state.reviewed += 1;
    } else {
      record.action = "exclude";
      decisionContext.excludeReason = blocked
        ? "LLM 或过滤规则判定直接排除"
        : (llmResult.decisionLog || "LLM 建议跳过");
      state.skipped += 1;
    }
    record.processingStatus = actionLabel(record.action);
    record.recommendedAction = record.recommendedAction || recommendedActionFor(record);
    record.mainReason = record.mainReason || mainReasonFor(record);
    record.decisionLog = record.decisionLog || buildDecisionLog(record, decisionContext);
    countProcessedAttempt();
    state.processedThisRun.add(job.href);
    log(record);
    debugLog("process_job_done", {
      title: job.title,
      href: job.href,
      action: record.action,
      score: record.score,
      mainReason: record.mainReason
    });
    await sleep(700 + Math.random() * 900);
  }

  async function start(options = {}) {
    if (state.running) return;
    clearTimers();
    readPanelConfig();
    saveDailyStats();
    debugLog("start_called", { options });
    if (!aiConfigured()) {
      const message = "未保存第三方大模型key，无法启动扫描。请先在高级规则中填写并保存 Key；岗位判断必须经过 LLM。";
      alertMissingAiKey("启动或继续扫描");
      updateStatus(statusSummary(message));
      setNote("#baf-rules-note", message);
      debugLog("start_blocked_missing_ai_key");
      return;
    }
    if (options.campaignMode) {
      const typedKeywords = parseKeywordList(document.querySelector("#baf-keywords")?.value || "");
      if (!typedKeywords.length) {
        updateStatus(statusSummary("多关键词模式缺少搜索词：请先填写或生成搜索词。"));
        setNote("#baf-keyword-note", "多关键词模式会先按搜索词搜索，再扫描搜索结果。请先填写或生成至少一个搜索词。");
        debugLog("start_blocked_missing_keywords");
        return;
      }
      const campaignStart = options.resumeCampaign && state.campaign?.active
        ? { resumed: true, autoResume: true }
        : resumeOrCreateCampaign({ resumePaused: Boolean(options.resumePaused) });
      if (!campaignStart.resumed && !campaignStart.autoResume) {
        resetRunCounters();
        state.pausedByUserThisSession = false;
      }
      if (!campaignStart.resumed && !campaignStart.autoResume && !norm(keywordFromCampaign())) {
        const firstRealIndex = (state.campaign?.keywords || []).findIndex(keyword => norm(keyword));
        if (firstRealIndex >= 0 && Number(state.campaign?.keywordScanned || 0) === 0) {
          state.campaign.index = firstRealIndex;
          saveCampaign();
        }
      }
      const firstKeyword = keywordFromCampaign();
      const actionText = campaignStart.resumed ? "\u51c6\u5907\u7ee7\u7eed" : "\u51c6\u5907\u641c\u7d22";
      debugLog("prepare_first_keyword", { resumed: campaignStart.resumed, keyword: keywordLabel(firstKeyword) });
      updateStatus(statusSummary(`${actionText}\u7b2c ${Number(state.campaign?.index || 0) + 1} \u4e2a\u5173\u952e\u8bcd\uff1a${keywordLabel(firstKeyword)}`));
      const result = await ensureKeywordReady(firstKeyword, "prepare_first_keyword");
      if (result === "navigated" || result === "failed") return;
    } else if (!options.resumeCampaign) {
      state.campaign = null;
      saveCampaign();
      resetRunCounters();
      state.pausedByUserThisSession = false;
    }
    seedProcessedFromRecords();
    const initialStopReason = safetyStopReason();
    if (initialStopReason) {
      if (state.campaign?.active) {
        state.campaign.active = false;
        state.campaign.paused = false;
        saveCampaign();
      }
      updateStatus(statusSummary(initialStopReason));
      debugLog("initial_stop", { reason: initialStopReason });
      return;
    }
    state.running = true;
    debugLog("scan_loop_started");
    updatePanel();

    let staleRounds = 0;
    let emptyRounds = 0;
    let duplicateRounds = 0;
    let lowResultWaitRounds = 0;
    let consecutiveErrors = 0;
    let finishCurrentKeyword = false;
    const startedScanned = state.scanned;
    if (state.campaign?.active) {
      state.campaign.phase = "scan_results";
      state.campaign.keywordSearchStatus = "ready";
      saveCampaign();
      updateStatus(statusSummary(`已确认搜索结果，开始扫描：${keywordLabel(keywordFromCampaign())}`));
    }
    while (state.running && !finishCurrentKeyword) {
      const stopReason = safetyStopReason();
      if (stopReason) {
        if (state.campaign?.active) {
          state.campaign.active = false;
          state.campaign.paused = false;
          saveCampaign();
        }
        updateStatus(statusSummary(stopReason));
        debugLog("safety_stop", { reason: stopReason });
        break;
      }
      const scannedThisRun = state.campaign?.active
        ? Number(state.campaign.keywordScanned || 0)
        : state.scanned - startedScanned;
      const currentLimit = state.campaign?.active
        ? Number(state.campaign.perKeywordMax || DEFAULT_PER_KEYWORD_MAX)
        : Number(config.maxJobs || 80);
      if (scannedThisRun >= currentLimit) {
        debugLog("keyword_limit_reached", { scannedThisRun, currentLimit });
        break;
      }
      const visibleJobs = getJobLinks();
      const jobs = visibleJobs.filter(j => !state.processedThisRun.has(j.href) && !state.historicalSeen.has(j.href));
      const runDuplicateCount = visibleJobs.filter(j => state.processedThisRun.has(j.href)).length;
      const historicalSkipCount = visibleJobs.filter(j => !state.processedThisRun.has(j.href) && state.historicalSeen.has(j.href)).length;
      const duplicateVisibleCount = visibleJobs.length - jobs.length;
      debugLog("job_links_found", { count: jobs.length, visibleCount: visibleJobs.length, duplicateVisibleCount, runDuplicateCount, historicalSkipCount, scannedThisRun, currentLimit });
      if (!jobs.length) {
        const onlySeenJobs = visibleJobs.length > 0 && duplicateVisibleCount > 0;
        if (onlySeenJobs) {
          duplicateRounds += 1;
          emptyRounds = 0;
        } else {
          emptyRounds += 1;
        }
        const scroller = findJobScroller();
        if (!scroller || typeof scroller.scrollBy !== "function") {
          updateStatus(statusSummary("没有找到岗位列表，准备切换到下一个搜索词。"));
          debugLog("job_scroller_missing", { emptyRounds, duplicateRounds, visibleCount: visibleJobs.length });
          break;
        }
        const before = scroller.scrollTop;
        if (onlySeenJobs) {
          updateStatus(statusSummary(`当前屏都是已扫过岗位，继续往下翻 ${duplicateRounds}/${MAX_DUPLICATE_SCROLL_ATTEMPTS}。`));
          debugLog("duplicate_scroll_attempt", { duplicateRounds, staleRounds, visibleCount: visibleJobs.length, duplicateVisibleCount, scrollTop: before });
        } else {
          updateStatus(statusSummary(`暂时没有岗位，尝试滚动 ${emptyRounds}/${MAX_EMPTY_SCROLL_ATTEMPTS}。`));
          debugLog("empty_scroll_attempt", { emptyRounds, staleRounds, scrollTop: before });
        }
        scroller.scrollBy({ top: 720, behavior: "auto" });
        await sleep(1200);
        const afterVisibleJobs = getJobLinks();
        const afterJobs = afterVisibleJobs.filter(j => !state.processedThisRun.has(j.href) && !state.historicalSeen.has(j.href));
        if (afterJobs.length) {
          debugLog("empty_scroll_found_jobs", { count: afterJobs.length });
          staleRounds = 0;
          emptyRounds = 0;
          duplicateRounds = 0;
          continue;
        }
        if (scroller.scrollTop === before) staleRounds += 1;
        if (onlySeenJobs) {
          const stillOnlySeenJobs = afterVisibleJobs.length > 0 && afterJobs.length === 0;
          if (staleRounds >= 5 || (stillOnlySeenJobs && duplicateRounds >= MAX_DUPLICATE_SCROLL_ATTEMPTS)) {
            updateStatus(statusSummary("已连续翻过大量已扫岗位，当前搜索词暂时没有更多新岗位，准备切换。"));
            debugLog("keyword_no_more_new_jobs_after_duplicates", {
              duplicateRounds,
              staleRounds,
              visibleCount: afterVisibleJobs.length
            });
            break;
          }
          continue;
        }
        if (state.campaign?.active && scannedThisRun < 3 && emptyRounds >= MAX_EMPTY_SCROLL_ATTEMPTS && lowResultWaitRounds < 2) {
          lowResultWaitRounds += 1;
          emptyRounds = 0;
          staleRounds = 0;
          updateStatus(statusSummary(`当前搜索词结果较少，继续等待加载 ${lowResultWaitRounds}/2。`));
          debugLog("low_result_extra_wait", { scannedThisRun, lowResultWaitRounds });
          await sleep(SEARCH_PAGE_LOAD_WAIT_MS);
          continue;
        }
        if (staleRounds >= 3 || emptyRounds >= MAX_EMPTY_SCROLL_ATTEMPTS) {
          updateStatus(statusSummary("当前搜索词没有更多新岗位，准备切换。"));
          debugLog("keyword_no_more_jobs", { emptyRounds, staleRounds });
          break;
        }
        continue;
      }
      staleRounds = 0;
      emptyRounds = 0;
      duplicateRounds = 0;
      for (const job of jobs) {
        const scannedNow = state.campaign?.active
          ? Number(state.campaign.keywordScanned || 0)
          : state.scanned - startedScanned;
        if (!state.running || scannedNow >= currentLimit) break;
        const stopReason = safetyStopReason();
        if (stopReason) {
          updateStatus(statusSummary(stopReason));
          debugLog("safety_stop_inside_job_loop", { reason: stopReason });
          if (state.campaign?.active) {
            state.campaign.active = false;
            state.campaign.paused = false;
            saveCampaign();
          }
          state.running = false;
          break;
        }
        try {
          await processJob(job);
          consecutiveErrors = 0;
          const pauseEvery = Number(config.safety.pauseEvery || 0);
          if (
            state.running &&
            pauseEvery > 0 &&
            state.daily.scanned > 0 &&
            state.daily.scanned % pauseEvery === 0
          ) {
            const rest = randomBetweenSec(config.safety.pauseMinSec, config.safety.pauseMaxSec);
            await waitWithCountdown(rest, `已扫 ${state.daily.scanned} 个，安全休息`);
          }
        } catch (err) {
          state.errors += 1;
          consecutiveErrors += 1;
          const detailNotConfirmed = err instanceof JobDetailNotConfirmedError;
          const llmJudgementFailed = err instanceof LlmJudgementError;
          if (!detailNotConfirmed && !llmJudgementFailed) {
            countProcessedAttempt();
            state.processedThisRun.add(job.href);
          }
          debugLog("process_job_error", {
            title: job.title,
            href: job.href,
            error: String(err && err.message || err),
            consecutiveErrors,
            detail: err?.detail || null
          });
          log({
            time: new Date().toISOString(),
            title: job.title,
            href: job.href,
            cardText: job.cardText,
            score: 0,
            hits: [],
            negatives: [String(err && err.message || err)],
            action: "error",
            ruleVersion: RULE_VERSION,
            needsReview: true,
            processingStatus: "错误",
            recommendedAction: detailNotConfirmed
              ? "刷新页面或复制运行日志排查详情切换"
              : llmJudgementFailed
                ? "检查 API Key、模型或网络后继续"
                : "跳过当前岗位，继续扫描",
            mainReason: detailNotConfirmed
              ? "右侧详情未切换，已阻止旧详情判断"
              : llmJudgementFailed
                ? "LLM 岗位判断失败，已暂停"
                : "页面处理失败",
            transient: detailNotConfirmed || llmJudgementFailed,
            decisionLog: detailNotConfirmed
              ? `点击左侧岗位后，右侧详情未确认匹配当前岗位；${JSON.stringify(err?.detail || {})}`
              : llmJudgementFailed
                ? `LLM 判断未完成，禁止降级到本地规则；${JSON.stringify(err?.detail || {})}`
                : ""
          });
          saveDailyStats();
          if (detailNotConfirmed || llmJudgementFailed) {
            updateStatus(statusSummary(detailNotConfirmed
              ? "右侧详情没有切换到当前岗位，已暂停，避免继续用旧详情判断。"
              : "LLM 岗位判断失败，已暂停；不会使用本地规则继续扫描。"));
            if (state.campaign?.active) {
              state.campaign.active = false;
              state.campaign.paused = true;
              state.campaign.phase = detailNotConfirmed ? "detail_failed" : "llm_judgement_failed";
              state.campaign.keywordSearchStatus = detailNotConfirmed ? "detail_failed" : "llm_judgement_failed";
              state.campaign.keywordError = String(err && err.message || err);
              state.campaign.pausedAt = Date.now();
              state.pausedByUserThisSession = true;
              saveCampaign();
            }
            state.running = false;
            finishCurrentKeyword = true;
            break;
          }
          updateStatus(statusSummary("处理单条岗位出错，已跳过并继续。"));
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            updateStatus(statusSummary(`连续 ${consecutiveErrors} 条岗位处理失败，准备切换到下一个搜索词。`));
            debugLog("too_many_consecutive_errors", { consecutiveErrors });
            finishCurrentKeyword = true;
            break;
          }
        }
      }
    }
    state.running = false;
    debugLog("scan_loop_finished", { campaignActive: Boolean(state.campaign?.active), campaignPaused: Boolean(state.campaign?.paused) });
    updatePanel();
    if (state.campaign?.active) {
      moveToNextKeyword();
    } else if (state.campaign?.paused) {
      updateStatus(statusSummary("多词任务已暂停。下次点击“启动/继续”会从当前关键词继续。"));
    } else {
      showFeedbackPanel("本次扫描已完成。");
    }
  }

  function bootPanel() {
    createPanel();
    hydrateAiSettingsFromExtensionStorage().catch(error => {
      debugLog("ai_settings_hydrate_error", { error: String(error?.message || error) });
    });
  }

  if (document.body) {
    bootPanel();
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      if (!document.querySelector("#boss-ai-autofav-panel")) {
        bootPanel();
      }
    }, { once: true });
  }
  if (state.campaign?.active) {
    const keyword = keywordFromCampaign();
    const delay = 3000 + Math.random() * 2500;
    updateStatus(`\u68c0\u6d4b\u5230\u672a\u5b8c\u6210\u4efb\u52a1\uff0c${Math.round(delay / 1000)} \u79d2\u540e\u7ee7\u7eed\uff1a${keywordLabel(keyword)}`);
    state.autoTimer = window.setTimeout(() => {
      if (!state.campaign?.active || state.campaign?.paused) return;
      start({ campaignMode: true, resumeCampaign: true });
    }, delay);
  }
})();
