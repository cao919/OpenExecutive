# AI 提供商管理（Providers）

Open Executive 的所有 LLM 调用都走同一个 `get_provider(model)` 抽象，按模型 slug 选择后端。来源分两类：

| 类型 | 来源 | 修改方式 | 是否需重启 |
|---|---|---|---|
| **内置** providers | 仓库根 `.env`（`ANTHROPIC_API_KEY` / `OPENROUTER_*` / `LOCAL_*` / `ZHIPUAI_*`） | 改 `.env` | **是**（pydantic-settings 启动时读） |
| **自定义** providers | UI 的「设置 → AI 提供商」面板，持久化在 SQLite | 在 UI 加/改/删 | **否**（热加载，下一次调用即时生效） |

自定义 providers 通过 `/api/backend/providers` CRUD 暴露在设置面板。任何 **OpenAI 兼容** 的 `/v1/chat/completions` 接口都能挂上 —— LM Studio、vLLM、llama.cpp、OpenRouter 之外的代理、智谱、Mistral、DeepSeek、Moonshot 等任意一家都行。

---

## ⚡ TL;DR：最常见的切换——怎么切回本地 LM Studio

> 适用：本地 LM Studio 已经启动（默认 `http://127.0.0.1:1234`），里面加载了一个模型，你想把它接进来。

**四步完成，不用重启**：

1. 打开 **设置 → AI 提供商**
2. 点 **+ 添加提供商**，填这四个字段：

   | 字段 | 值 |
   |---|---|
   | 名称（Name） | `LM Studio Local` |
   | 接口地址（Base URL） | `http://127.0.0.1:1234/v1` |
   | API Key | `sk-lm-duPznAMl:sqE4Jt9mrENVCu7iI3K7`（或 `not-required`） |
   | 模型列表（Models） | `zai-org/glm-4.7-flash`（一行一个；**避开纯 reasoning/thinking 模型**，否则 chat 会返回空） |

3. 点 **保存** → 卡片右上角点 **测试**，看到 `200 · 200ms · N 个上游模型` 即连得通。
4. 打开 **Council → Executive**，把「模型」下拉切到 `zai-org/glm-4.7-flash`（或你填的其它 slug）→ 立即生效。

> 想切回远程？同样在 Council 把模型选回 `glm-4-flash`（智谱）即可，不用动 provider 卡片。

---

## 通用步骤：添加一个自定义 provider

1. 打开 **设置 → AI 提供商**（页面顶部附近，紧跟在「界面语言」卡片后面）。
2. 在「自定义」行点 **+ 添加提供商**。
3. 填写四个字段：

   | 字段 | 含义 | 示例 |
   |---|---|---|
   | **名称** | 显示名（同一台机内唯一） | `LM Studio Local` |
   | **Base URL** | OpenAI 兼容端点，必须含 `/v1` 前缀 | `http://127.0.0.1:1234/v1` |
   | **API Key** | Bearer token；本地无 token 时填任意非空串（如 `not-required`），不要留空 | `sk-lm-...` 或 `not-required` |
   | **Models** | 一行一个 slug，会出现在 Council 下拉 | `zai-org/glm-4.6`<br>`qwen2.5-coder:14b` |

4. 点 **保存**。
5. 点该卡片右上角的 **测试** 按钮 —— 会 `GET {base_url}/models` 验证连通性，返回 `ok` / `status_code` / `latency_ms` / `advertised_models`。
6. 进入 **Council → Executive**（或任何 specialist），把模型下拉切到你刚才填的 slug。**立即生效**，无需重启。

> **注意**：`api_key` 字段如果**留空**，保存时会写入空字符串。下次「编辑」看到该 provider 时，会被当作「key 已被清空」处理 —— 服务端不会再带 Authorization header 调用该 provider。如果你想保留旧 key，编辑时**不要碰** API Key 一栏（输入框显示 `•••（留空保持现有 key）`）。

---

## 三种典型切换场景

### A. 切到本地 LM Studio（本地推理）

适用：想脱网、想省 token 钱、想测私有模型。

**前置**：LM Studio 已经启动（默认 `http://127.0.0.1:1234`），里面已经加载了一个模型（比如 `zai-org/glm-4.7-flash`、`qwen2.5-coder:14b` 等）。

**操作**：

1. **设置 → AI 提供商 → + 添加提供商**
2. 填写：
   - **名称**：`LM Studio Local`（或任意你喜欢的）
   - **Base URL**：`http://127.0.0.1:1234/v1`
   - **API Key**：`not-required`（或你在 LM Studio → Settings → API 设置里设的 token，如 `sk-lm-duPznAMl:sqE4Jt9mrENVCu7iI3K7`）
   - **Models**：`zai-org/glm-4.7-flash`（一行一个；填 LM Studio 当前加载的模型 slug）
3. 保存 → 点 **测试** → 应看到 `200 / 200ms / N 个上游模型`。
4. **Council → 模型下拉 → 选 `zai-org/glm-4.7-flash`** → 立即生效。

**避坑**：

- ❌ **不要选 reasoning-only 模型做 chat 默认**（例如 `zai-org/glm-4.7-flash` 是 thinking 模型，会把所有 token 预算花在 `reasoning_content` 上，`delta.content` 永远是空）。如果一定要用，参见 [translator.py 的 reasoning fallback 修复](https://github.com/cao919/OpenExecutive/blob/maincode/packages/core/openexecutive/providers/translator.py) —— 至少现在 close-of-stream 时会把 reasoning 内容落成可见文本。
- ✅ **推荐** Llama 3.3 70B、Qwen2.5 14B+、Mistral Nemo 等指令调优过的 chat 模型。越小越可能在 8k-token 工具 prompt 上失败。

**关闭 LM Studio 后**：测试按钮返回 `connect refused`，Council 选这个 slug 会在下一次 chat 时报「内部错误」。**关掉 toggle**（卡片右侧「启用」开关）即可让模型从下拉里消失，但保留配置。

### B. 切回远程智谱 GLM（生产默认）

适用：网络稳定、追求质量、不在意 token 成本。

**前置**：已经在 `.env` 里设置：

```bash
ZHIPUAI_ENABLED=true
ZHIPUAI_API_KEY=你的智谱 key
ZHIPUAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPUAI_MODELS=glm-4-flash,glm-4-air,glm-4-plus
```

**操作**：

1. **不需要在 UI 加任何东西**。智谱是内置 provider，`/agents/models` 会直接返回这三个 slug。
2. **Council → 模型下拉 → 选 `glm-4-flash`** → 立即生效。

**测连通**：`curl https://open.bigmodel.cn/api/paas/v4/models -H "Authorization: Bearer $ZHIPUAI_API_KEY"`，应返回模型列表。

### C. 接 OpenRouter（一个 key 通吃多家）

OpenRouter 已经内置支持，但只在 `OPENROUTER_ENABLED=true` 时路由过去。

**前置**：

```bash
OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1  # 默认值，可省
```

**操作**：重启后端 → Council 下拉会出现 `openai/gpt-4o`、`anthropic/claude-3.5-sonnet`、`meta-llama/llama-3.3-70b-instruct` 等 OpenRouter slug。直接选。

---

## 进阶：自定义 provider 实际发生了什么

每次 chat 调 `get_provider("zai-org/glm-4.7-flash")` 时，registry 按下表查找：

```
1. 自定义 providers（SQLite + 5s TTL 缓存）
   ↓ slug 命中 → OpenAICompatibleProvider(base_url=你的, api_key=你的)
2. LOCAL_MODELS 里命中 → LocalProvider（读 LOCAL_BASE_URL）
3. ZhipuAI slugs + ZHIPUAI_ENABLED=true → ZhipuAIProvider
4. OpenRouter slugs + OPENROUTER_ENABLED=true → OpenRouterProvider
5. Claude slugs → AnthropicProvider
```

每条命中都用 `OpenAICompatibleProvider`（同一个类），只是 `base_url` / `api_key` 不同。所以 **任何 OpenAI 兼容端点都能挂**。

---

## 常见问题

**Q：我加了 provider 但 Council 下拉没显示该 slug？**
A：检查 (1) slug 是否在 Models 字段里正确填了（一行一个、不要有多余空格）；(2) provider 是否启用（卡片右下角 toggle）；(3) 浏览器强制刷新一次（`Cmd/Ctrl-Shift-R`）。

**Q：测试按钮显示 `ok=false`，但浏览器能访问那个 URL？**
A：常见原因是 `Base URL` 带了路径尾的 `/` 或缺了 `/v1`。LM Studio 应是 `http://127.0.0.1:1234/v1`，Ollama 应是 `http://127.0.0.1:11434/v1`。

**Q：我能直接编辑内置的 Anthropic / 智谱吗？**
A：**不能**。内置由 `.env` 控制，改 `.env` + 重启。Settings UI 只管理**自定义** providers（数据库里那些）。

**Q：自定义 providers 存在哪？删了会不会丢 .env 设置？**
A：自定义 providers 存在 `packages/core/agent_providers.db`（或 `EPISODIC_DB_PATH` 同目录的 `agent_providers.db`）。**和 `.env` 完全独立** —— 删自定义不会影响 `.env`；改 `.env` 也不会影响自定义。

**Q：API key 在前端显示的是 mask 吗？**
A：是的，列表里看到 `…t7yk` 这种 4 位尾缀。编辑表单里不显示明文，留空 = 保留旧值。

---

## 相关文件

- 前端：`packages/ui/src/components/ProvidersSection.tsx`
- 后端路由：`packages/core/openexecutive/api/routes/providers_admin.py`
- 后端 store：`packages/core/openexecutive/providers/provider_store.py`
- 注册与路由：`packages/core/openexecutive/providers/registry.py`
- Provider 实现：`packages/core/openexecutive/providers/openai_compatible.py`
- i18n 文案：`packages/ui/src/i18n/zh.ts` 和 `en.ts` 的 `providers.*`