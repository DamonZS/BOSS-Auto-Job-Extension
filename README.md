# BOSS-Auto-Job-Extension

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-0f766e)](manifest.json)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2563eb)](manifest.json)
[![Version](https://img.shields.io/badge/version-2.0.6-0f766e)](manifest.json)

一个给 BOSS 直聘网页端使用的本地 Chrome 扩展。

它的目标很直接：把重复、费眼、容易漏看的岗位筛选流程自动化。你给出岗位性质、目标方向、搜索词和规则词，它负责批量扫描岗位、打开详情、调用大模型评分、自动收藏高匹配岗位，并把边界岗位放进待复核列表。

![控制台面板预览](docs-panel-console.png)

## 适合谁

- 每天要在 BOSS 上翻很多相似岗位的人
- 想按岗位性质 + 行业方向 + 规则词稳定筛岗的人
- 不想只靠关键词命中，希望每个岗位都经过 AI 判断的人
- 需要把筛选结果复制到表格、Notion、飞书或后续分析流程里的人

## 核心能力

### 1. 多关键词批量扫描

- 支持“当前列表”模式和“多关键词”模式
- 可为每个搜索词设置最大扫描数量
- 可选最后扫描推荐流
- 可跳过历史已扫岗位

### 2. AI 生成搜索词

根据你填写的岗位性质和目标方向，调用第三方大模型生成更贴近 BOSS 岗位标题的搜索词，避免只写泛词导致搜索过宽。

### 3. AI 生成加分词 / 排除词

基于当前搜索词、岗位性质和目标方向生成少量规则词，用来辅助评分和过滤明显不想看的岗位。

### 4. 先切详情，再评分

扩展不会只看列表卡片就下判断。它会先点击岗位、确认右侧详情已经切换到当前岗位，再继续读取详情并调用 AI 评分，避免用旧详情误判新岗位。

### 5. 1-100 分 AI 评分

大模型会结合：

- 岗位标题
- 岗位详情
- 岗位性质
- 目标方向
- 薪资边界
- 正向词 / 反向词

输出 1-100 分的匹配分数，并给出原因和建议动作。

### 6. 自动收藏与待复核

- 达到收藏分：尝试自动收藏
- 处于边界区间：进入待复核
- 明显不匹配：排除或跳过
- 收藏失败：记录失败原因，支持回溯

### 7. 可选自动打招呼

默认关闭。开启后，只会对已收藏且达到最低分的岗位尝试发送你预设的打招呼内容。

### 8. 完整导出与日志

支持复制：

- 全量表格
- 全量 JSON
- 待复核表格 / JSON / 链接
- 已收藏记录
- 收藏失败记录
- 运行日志
- 诊断信息

## 当前面板设计

当前版本采用“专业控制台”布局：

- 顶部主控条：运行灯、启动/暂停、收起
- 左侧主配置区：任务配置、搜索与扫描、规则与 AI
- 右侧运行区：运行状态、最近失败、最近判断
- 横向高级规则区：AI Key、安全限制、规则词全部展开显示

这样做的目的，是把最常用的操作和最关键的状态放在同一视野内，减少反复展开和来回切换。

## 安装方法

1. 下载或克隆本仓库
2. 打开 Chrome，进入 `chrome://extensions/`
3. 打开右上角“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择本项目目录
6. 打开 BOSS 直聘网页端岗位列表页

## 推荐使用流程

1. 先在 BOSS 页面顶部设置城市、经验、学历、薪资等基础筛选
2. 打开扩展面板，填写岗位性质和目标方向
3. 在高级规则区填写第三方大模型 Key 并保存
4. 点击“生成搜索词”
5. 手动删改不想要或太泛的搜索词
6. 需要时点击“生成加分词/排除词”
7. 设置收藏分、扫描上限和暂停节奏
8. 启动扫描
9. 扫描结束后复制表格或待复核结果继续处理

## 大模型配置

当前默认走 OpenAI 兼容接口：

```text
https://api.toporeduce.cn/v1/chat/completions
```

默认模型：

```text
deepseek-v4-flash
```

需要在面板中填写并保存第三方大模型 Key。没有 Key 时，下面这些动作会被拦截并给出强提示：

- 生成搜索词
- 启动 / 继续扫描
- 生成加分词 / 排除词

## 隐私与边界

- 扩展主要运行在本地浏览器环境
- Key 保存在扩展私有存储中
- 不自动投递简历
- 不读取聊天记录
- 不在没有 Key 的情况下偷偷退回本地规则继续跑
- 遇到验证码、登录异常、账号提示时应立即暂停

## 验证命令

```bash
node --check content.js
node --check background.js
node scripts/regression-checks.js
```

## 版本更新

面板顶部提供版本检测入口，会显示当前版本、GitHub 最新版本和最近检测时间。

点击“检测”后，扩展会优先请求 GitHub Releases 最新版本；如果仓库还没有 Releases，会回退检查 `main` 分支的 `manifest.json`。发现新版本时，面板会强提示“发现新版本 vX.X.X”，并显示“下载”按钮。

注意：普通 `git push` 只会上传代码，不会自动生成 Releases 或版本压缩包。要自动发版，需要推送版本标签，触发 GitHub Actions。

发布新版本：

```bash
git add manifest.json background.js content.js README.md .github/workflows/release.yml
git commit -m "chore: 发布 v2.0.7"
git tag v2.0.7
git push origin main
git push origin v2.0.7
```

GitHub Actions 会自动校验脚本、打包扩展，并创建 GitHub Releases。也可以在 GitHub 仓库的 Actions 页面手动运行 `Build Extension Release`。

手动更新步骤：

1. 点击面板顶部的“下载”。如果已有 Release，会打开 GitHub Releases；如果 Releases 为空，会下载 `main.zip`。
2. 下载最新版本压缩包。
3. 解压到本地目录，保留自己的使用记录和 Key 不需要写进仓库。
4. 打开 `chrome://extensions/`。
5. 找到 `BOSS-Auto-Job-Extension`，点击重新加载；如果目录变了，重新“加载已解压的扩展程序”。

## 项目结构

```text
BOSS-Auto-Job-Extension/
|-- manifest.json
|-- background.js
|-- content.js
|-- docs-panel-console.png
|-- ui-mockups.html
|-- .github/
|   `-- workflows/release.yml
|-- scripts/
|   `-- regression-checks.js
`-- README.md
```

## 说明

这个项目当前重点不在“多平台适配”，而在“把 BOSS 岗位筛选这件事做得更稳、更可控、更可复盘”。

如果这套工具真的帮你少翻了很多重复岗位，欢迎点个 Star。
