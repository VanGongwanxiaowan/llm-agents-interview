# 模型与 Provider 体系详解

> 本文档面向希望学习 agent 开发的读者，详细解析 OpenClaw 中多提供商模型、别名、白名单、回退与动态发现的全链路设计。

---

## 目录

1. [整体架构概述](#1-整体架构概述)
2. [第一步：默认值与基础规则 (`defaults.ts`)](#2-第一步默认值与基础规则-defaultsts)
3. [第二步：模型配置落地 (`models-config.ts` + `models-config.plan.ts`)](#3-第二步模型配置落地-models-configts--models-configplantts)
4. [第三步：Provider 合并与规范化 (`models-config.merge.ts` + `models-config.providers.ts`)](#4-第三步provider-合并与规范化-models-configmergets--models-configprovidersts)
5. [第四步：模型目录加载 (`model-catalog.ts`)](#5-第四步模型目录加载-model-catalogts)
6. [第五步：模型选择与别名解析 (`model-selection.ts`)](#6-第五步模型选择与别名解析-model-selectionts)
7. [第六步：失败回退策略 (`model-fallback.ts`)](#7-第六步失败回退策略-model-fallbackts)
8. [第七步：Embedded Runner 解析模型 (`pi-embedded-runner/model.ts`)](#8-第七步embedded-runner-解析模型-pi-embedded-runnermodelts)
9. [数据流总览](#9-数据流总览)
10. [设计亮点与经验总结](#10-设计亮点与经验总结)

---

## 1. 整体架构概述

整个体系解决的核心问题是：**当用户说"用 sonnet-4.6"时，系统如何找到对应的模型并正确调用它"**。

这个问题分解为 7 个子问题，映射到 7 个源文件：

```
用户配置/默认配置
        │
        ▼
defaults.ts              ← 提供硬编码默认值（provider、model、contextTokens）
        │
        ▼
models-config.ts         ← 确保 agent 目录下的 models.json 存在且最新
        │
        ▼
models-config.plan.ts    ← 规划 models.json 的写入策略（skip/noop/write）
        │
        ▼
models-config.providers.ts← 规范化 provider 配置、解析隐式 provider
        │
        ▼
models-config.merge.ts   ← 合并显式配置与隐式配置（env/认证文件中的 provider）
        │
        ▼
models.json（落地文件）
        │
        ▼
model-catalog.ts         ← 从 Pi SDK registry 读取可用模型，缓存结果
        │
        ▼
model-selection.ts       ← 处理别名、规范 provider ID、解析 allowlist
        │
        ▼
model-fallback.ts        ← 按候选列表依次尝试，失败时切换
        │
        ▼
pi-embedded-runner/model.ts← 最终落地：查注册表→inline provider→plugin 动态模型
```

---

## 2. 第一步：默认值与基础规则 (`defaults.ts`)

**文件位置**: `src/agents/defaults.ts`

这是整个体系的最底层，只包含三个常量：

```typescript
export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_MODEL = "claude-opus-4-6";
export const DEFAULT_CONTEXT_TOKENS = 200_000;
```

**为什么这样设计？**

- 当配置文件中没有指定 model 时，系统使用 `anthropic/claude-opus-4-6` 作为兜底
- `DEFAULT_CONTEXT_TOKENS = 200_000` 是保守估算的 context window，当模型元数据不可用时使用

**设计经验**：默认值应该永远使用最稳定、最通用的选项，不要假设用户做了任何配置。

---

## 3. 第二步：模型配置落地 (`models-config.ts` + `models-config.plan.ts`)

### 3.1 `models-config.ts` 的职责

**文件位置**: `src/agents/models-config.ts`

核心函数：`ensureOpenClawModelsJson()`

这个函数解决的是：**如何安全地写入 agent 目录下的 `models.json` 文件**。

**核心处理细节**：

**1. 写入锁机制（防止并发写冲突）**

```typescript
const MODELS_JSON_WRITE_LOCKS = new Map<string, Promise<void>>();

async function withModelsJsonWriteLock<T>(targetPath: string, run: () => Promise<T>): Promise<T> {
  const prior = MODELS_JSON_WRITE_LOCKS.get(targetPath) ?? Promise.resolve();
  // ... 排队机制
}
```

同一个 agent 目录可能同时被多个 channel handler 访问，写入锁确保排队执行。

**2. 原子写入（防止文件损坏）**

```typescript
async function writeModelsFileAtomic(targetPath: string, contents: string): Promise<void> {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, contents, { mode: 0o600 }); // 先写临时文件
  await fs.rename(tempPath, targetPath);                   // 再原子 rename
}
```

**关键点**：先写 `.tmp` 文件，再 rename。rename 在 POSIX 系统上是原子操作，保证文件要么完整写入，要么不存在。

**3. 环境变量隔离（不污染 `process.env`）**

```typescript
const env = createConfigRuntimeEnv(cfg); // 从配置构建独立的环境变量副本
```

有些 provider 需要特定环境变量（如 `AWS_PROFILE`）才能被发现，但不应该修改全局 `process.env`。

**4. 权限设置（文件安全）**

```typescript
await fs.chmod(targetPath, 0o600); // 只有所有者可读写
```

`models.json` 可能包含 API key，必须限制权限。

---

### 3.2 `models-config.plan.ts` 的职责

**文件位置**: `src/agents/models-config.plan.ts`

这个文件解决的是：**判断 `models.json` 是否需要写入**。

**三种决策**：

```typescript
export type ModelsJsonPlan =
  | { action: "skip" }      // 不写入（没有 provider）
  | { action: "noop" }      // 不写入（内容没变化）
  | { action: "write"; contents: string }; // 写入
```

**核心逻辑**：

```typescript
if (Object.keys(providers).length === 0) {
  return { action: "skip" }; // 没有 provider，不需要写入
}

const nextContents = `${JSON.stringify({ providers: finalProviders }, null, 2)}\n`;
if (params.existingRaw === nextContents) {
  return { action: "noop" }; // 内容没变，不需要写入
}
```

**为什么用 noop 而不是 skip？** 当用户已有 `models.json` 但恰好内容没变化时，应该保持文件不变（包括权限），避免不必要的写操作。

---

## 4. 第三步：Provider 合并与规范化 (`models-config.merge.ts` + `models-config.providers.ts`)

这是整个体系中最复杂的部分，处理"显式配置"与"隐式发现"的关系。

### 4.1 显式配置 vs 隐式配置

**显式配置**：用户在 `openclaw.json` 中明确声明的 provider：

```json
{
  "models": {
    "providers": {
      "anthropic": {
        "apiKey": "sk-ant-..."
      }
    }
  }
}
```

**隐式配置**：系统通过环境变量、认证文件、插件等途径自动发现的 provider。

### 4.2 Provider 合并策略 (`models-config.merge.ts`)

**文件位置**: `src/agents/models-config.merge.ts`

核心函数：`mergeProviders()` 和 `mergeProviderModels()`

**模型合并的精确规则**：

```typescript
export function mergeProviderModels(implicit: ProviderConfig, explicit: ProviderConfig): ProviderConfig {
  // 1. 用 explicit 的 API key、baseUrl、headers 覆盖 implicit
  // 2. 对于模型列表：
  //    - explicit 中有的模型 → 使用 explicit 的定义
  //    - implicit 中有但 explicit 没有的模型 → 追加到列表
  // 3. 特殊字段的处理：
  //    - contextWindow/maxTokens：优先 explicit，fallback 到 implicit
  //    - reasoning：explicit 显式设置则用 explicit，否则用 implicit
  //    - input：优先 implicit（因为通常来自官方定义，更准确）
}
```

**Example**：

```typescript
// implicit（从环境变量发现）
{ provider: "anthropic", models: [{ id: "claude-sonnet-4-5", contextWindow: 200000 }] }

// explicit（用户配置）
{ provider: "anthropic", models: [{ id: "claude-sonnet-4-5", contextWindow: 180000 }] }

// 合并结果：explicit 的 contextWindow 优先
{ models: [{ id: "claude-sonnet-4-5", contextWindow: 180000 }] }
```

### 4.3 Provider 规范化 (`models-config.providers.ts`)

**文件位置**: `src/agents/models-config.providers.ts`

这个文件处理多种规范化场景：

**1. API Key 来源解析**

```typescript
// 优先级：配置 > 环境变量 > 认证文件
const profileApiKey = resolveApiKeyFromProfiles({ provider, store: authStore, env });
if (hasModels && !hasConfiguredApiKey) {
  const fromEnv = resolveEnvApiKeyVarName(normalizedKey, env);
  const apiKey = fromEnv ?? profileApiKey?.apiKey;
  // ...填充缺失的 apiKey
}
```

**2. Secret Ref 规范化**

用户可能写 `"apiKey": "${ANTHROPIC_API_KEY}"` 或 `"apiKey": "ENV:ANTHROPIC_API_KEY"`。系统统一转换为环境变量名格式。

```typescript
const normalizedConfiguredApiKey = normalizeApiKeyConfig(configuredApiKey);
// "${ANTHROPIC_API_KEY}" → "ANTHROPIC_API_KEY"
```

**3. 隐式 Provider 发现顺序**

```typescript
// 按优先级排序
mergeImplicitProviderSet(providers, await resolvePluginImplicitProviders(context, "simple"));
mergeImplicitProviderSet(providers, await resolvePluginImplicitProviders(context, "profile"));
mergeImplicitProviderSet(providers, await resolvePluginImplicitProviders(context, "paired"));
mergeImplicitProviderSet(providers, await resolvePluginImplicitProviders(context, "late"));
```

**4. 特殊 Provider 规范化**

- **Google/Vertex**：模型 ID 规范化（如 `gemini-2.0-flash` → 特定格式）
- **Antigravity**：特殊模型 ID 后缀处理
- **Moonshot/ModelStudio**：流式 usage 兼容性标记

---

## 5. 第四步：模型目录加载 (`model-catalog.ts`)

**文件位置**: `src/agents/model-catalog.ts`

### 5.1 目录结构

```typescript
export type ModelCatalogEntry = {
  id: string;                    // 模型 ID，如 "claude-opus-4-6"
  name: string;                  // 显示名称
  provider: string;              // provider ID，如 "anthropic"
  contextWindow?: number;        // context window token 数
  reasoning?: boolean;           // 是否支持推理
  input?: ModelInputType[];      // 支持的输入类型 ["text", "image", "document"]
};
```

### 5.2 缓存机制（防缓存污染）

这是整个文件中最重要的设计：

```typescript
let modelCatalogPromise: Promise<ModelCatalogEntry[]> | null = null;
let hasLoggedModelCatalogError = false;

export async function loadModelCatalog(params?: { config?: OpenClawConfig; useCache?: boolean }): Promise<ModelCatalogEntry[]> {
  // 强制刷新
  if (params?.useCache === false) {
    modelCatalogPromise = null;
  }
  if (modelCatalogPromise) {
    return modelCatalogPromise;
  }

  modelCatalogPromise = (async () => {
    // ... 加载逻辑
  })();

  return modelCatalogPromise;
}
```

**关键点**：

1. **Promise 缓存而非结果缓存**：使用 Promise 而非直接结果，确保并发调用拿到同一个 Promise，避免重复执行
2. **失败时清除缓存**：

```typescript
} catch (error) {
  if (!hasLoggedModelCatalogError) {
    hasLoggedModelCatalogError = true;
    log.warn(`Failed to load model catalog: ${String(error)}`);
  }
  // 重要：失败时不缓存，这样下次调用会重试
  modelCatalogPromise = null;
  if (models.length > 0) {
    return sortModels(models); // 但返回已收集的部分结果
  }
  return [];
}
```

**场景**：假设在 `pnpm install` 期间，`node_modules` 被临时替换导致 Pi SDK 加载失败。如果缓存了 rejected Promise，所有 channel handler 都会持续失败直到进程重启。

3. **日志去重**：`hasLoggedModelCatalogError` 确保只记录一次错误，避免日志刷屏。

### 5.3 动态 Import 防失败

```typescript
// IMPORTANT: keep the dynamic import *inside* the try/catch.
// If this fails once (e.g. during a pnpm install that temporarily swaps node_modules),
// we must not poison the cache with a rejected promise (otherwise all channel handlers
// will keep failing until restart).
const piSdk = await importPiSdk();
```

---

## 6. 第五步：模型选择与别名解析 (`model-selection.ts`)

**文件位置**: `src/agents/model-selection.ts`

### 6.1 核心类型

```typescript
export type ModelRef = {
  provider: string;  // 如 "anthropic"
  model: string;     // 如 "claude-opus-4-6"
};
```

### 6.2 Provider ID 规范化

这是最容易出 bug 的地方，因为历史原因同样的 provider 有多种写法：

```typescript
export function normalizeProviderId(provider: string): string {
  const normalized = provider.trim().toLowerCase();

  // 别名归一化
  if (normalized === "z.ai" || normalized === "z-ai") return "zai";
  if (normalized === "opencode-zen") return "opencode";
  if (normalized === "qwen") return "qwen-portal";
  if (normalized === "bedrock" || normalized === "aws-bedrock") return "amazon-bedrock";
  if (normalized === "bytedance" || normalized === "doubao") return "volcengine";
  // ...
  return normalized;
}
```

### 6.3 模型 ID 规范化

```typescript
export function normalizeModelRef(provider: string, model: string): ModelRef {
  const normalizedProvider = normalizeProviderId(provider);
  const normalizedModel = normalizeProviderModelId(normalizedProvider, model.trim());
  return { provider: normalizedProvider, model: normalizedModel };
}
```

**Provider 特定规范化**：

```typescript
function normalizeProviderModelId(provider: string, model: string): string {
  if (provider === "anthropic") {
    // "sonnet-4.6" → "claude-sonnet-4-6"
    return normalizeAnthropicModelId(model);
  }
  if (provider === "google" || provider === "google-vertex") {
    return normalizeGoogleModelId(model);
  }
  if (provider === "openrouter" && !model.includes("/")) {
    // "aurora-alpha" → "openrouter/aurora-alpha"
    return `openrouter/${model}`;
  }
  return model;
}
```

### 6.4 别名系统

```typescript
export type ModelAliasIndex = {
  byAlias: Map<string, { alias: string; ref: ModelRef }>;  // "sonnet" → {provider: "anthropic", model: "claude-sonnet-4-6"}
  byKey: Map<string, string[]>;  // "anthropic/claude-sonnet-4-6" → ["sonnet", "opus-latest"]
};
```

**配置示例**：

```json
{
  "agents": {
    "defaults": {
      "models": {
        "anthropic/sonnet-4-5": {
          "alias": "sonnet",
          "params": { "thinking": "medium" }
        }
      }
    }
  }
}
```

### 6.5 Allowlist（白名单）

```typescript
export function buildAllowedModelSet(params: {
  cfg: OpenClawConfig;
  catalog: ModelCatalogEntry[];
  defaultProvider: string;
  defaultModel?: string;
  agentId?: string;
}): {
  allowAny: boolean;           // true = 不限制模型
  allowedCatalog: ModelCatalogEntry[];
  allowedKeys: Set<string>;
}
```

**关键设计**：

1. **显式 allowlist 条目始终信任**：即使 bundled catalog 数据过时，配置的模型也可用

```typescript
// 即使 catalog 中没有这个模型，也加入 allowedKeys
allowedKeys.add(key);
if (!catalogKeys.has(key) && !syntheticCatalogEntries.has(key)) {
  syntheticCatalogEntries.set(key, { id: parsed.model, name: parsed.model, provider: parsed.provider });
}
```

2. **Fallback 模型也加入 allowlist**：确保 fallback 链中的模型不会被白名单意外阻断

---

## 7. 第六步：失败回退策略 (`model-fallback.ts`)

**文件位置**: `src/agents/model-fallback.ts`

这是整个体系中最复杂的部分，处理"模型调用失败怎么办"。

### 7.1 核心类型

```typescript
export type ModelCandidate = {
  provider: string;
  model: string;
};

export type FallbackAttempt = {
  provider: string;
  model: string;
  error: string;
  reason?: FailoverReason;  // "rate_limit" | "auth" | "billing" | "model_not_found" | ...
  status?: number;
  code?: string;
};
```

### 7.2 Fallback 候选列表构建

```typescript
function resolveFallbackCandidates(params: {
  cfg: OpenClawConfig | undefined;
  provider: string;
  model: string;
  fallbacksOverride?: string[];
}): ModelCandidate[]
```

**构建顺序**：

1. **当前请求的模型**（primary）
2. **配置的 fallback 链**
3. **配置的默认模型**

**关键逻辑**：只有同 provider 时才使用完整 fallback 链

```typescript
// 当用户运行不同 provider 时，只在当前模型已在 fallback 链中才使用配置的 fallback
if (normalizedPrimary.provider !== configuredPrimary.provider) {
  const isConfiguredFallback = configuredFallbacks.some((raw) => {
    const resolved = resolveModelRefFromString({ raw, defaultProvider, aliasIndex });
    return resolved ? sameModelCandidate(resolved.ref, normalizedPrimary) : false;
  });
  return isConfiguredFallback ? configuredFallbacks : [];
}
```

### 7.3 Cooldown（冷却）机制

当 provider 因为 rate limit/billing/auth 问题不可用时，系统不会立即尝试，而是等待冷却。

```typescript
const MIN_PROBE_INTERVAL_MS = 30_000; // 30 秒内不重复探测同一 provider
const PROBE_MARGIN_MS = 2 * 60 * 1000; // 冷却期结束前 2 分钟开始探测
```

**探针机制**：

```typescript
function shouldProbePrimaryDuringCooldown(params: {
  isPrimary: boolean;
  hasFallbackCandidates: boolean;
  now: number;
  throttleKey: string;
  authStore: ReturnType<typeof ensureAuthProfileStore>;
  profileIds: string[];
}): boolean {
  // 1. 只有 primary 模型才探测
  // 2. 必须有 fallback 候选才探测
  // 3. 探测间隔至少 30 秒
  // 4. 冷却期快结束时（2 分钟内）提前探测
}
```

### 7.4 失败原因分类

```typescript
const inferredReason =
  resolveProfilesUnavailableReason({
    store: authStore,
    profileIds,
    now,
  }) ?? "unknown";

// 不同原因不同处理策略：
// - "auth" / "auth_permanent": 跳过，不重试
// - "billing": 单 provider 时立即探测，多 provider 时等冷却
// - "rate_limit" / "overloaded": 同 provider fallback 时放松冷却
// - "unknown": 同 provider fallback 时放松冷却
```

### 7.5 完整 Fallback 循环

```typescript
export async function runWithModelFallback<T>(params: {
  cfg: OpenClawConfig | undefined;
  provider: string;
  model: string;
  fallbacksOverride?: string[];
  run: ModelFallbackRunFn<T>;
  onError?: ModelFallbackErrorHandler;
}): Promise<ModelFallbackRunResult<T>>
```

**伪代码流程**：

```
1. 构建 candidates 列表
2. for each candidate:
   a. 检查 cooldown 状态
   b. 如果 all profiles in cooldown:
      - 持久 auth 问题 → skip
      - billing → 单 provider 时探测，否则 skip
      - transient 问题 → 决定是否探测或 skip
   c. 尝试运行
   d. 成功 → 返回结果
   e. 失败 → 分类错误
      - AbortError（非超时）→ 立即抛出
      - Context overflow → 立即抛出（不应切换模型）
      - 其他错误 → 记录并继续下一个 candidate
3. 所有候选都失败 → 抛出汇总错误
```

---

## 8. 第七步：Embedded Runner 解析模型 (`pi-embedded-runner/model.ts`)

**文件位置**: `src/agents/pi-embedded-runner/model.ts`

这是整个链路的最下游，最终将 `provider/modelId` 解析为可执行的 `Model<Api>` 对象。

### 8.1 三层查询策略

```typescript
export function resolveModelWithRegistry(params: {
  provider: string;
  modelId: string;
  modelRegistry: ModelRegistry;
  cfg?: OpenClawConfig;
  agentDir?: string;
}): Model<Api> | undefined
```

**查询顺序**：

```
1️⃣ 显式查询 registry（Pi SDK 的注册表）
   ↓ 找到
   ✅ 返回，并应用配置覆盖

   ↓ 没找到
2️⃣ 查询 inline provider（配置中内联的 provider）
   ↓ 找到且有 api 定义
   ✅ 返回

   ↓ 没找到或没有 api 定义
3️⃣ 尝试 plugin 动态模型
   ↓ 找到
   ✅ 返回

   ↓ 都没找到
4️⃣ 如果配置了 provider 但模型不存在，创建"合成模型"（synthetic model）
   - 使用配置的 api 类型（默认 "openai-responses"）
   - 使用配置的 baseUrl
   - 使用默认的 contextWindow
   ⚠️ 这个模型可能无法真正工作，但提供有意义的错误信息
```

### 8.2 配置覆盖（Override）

当 registry 中的模型与用户配置不一致时，配置优先：

```typescript
function applyConfiguredProviderOverrides(params: {
  discoveredModel: Model<Api>;
  providerConfig?: InlineProviderConfig;
  modelId: string;
}): Model<Api> {
  // 配置的 baseUrl > registry 的 baseUrl
  // 配置的 api > registry 的 api
  // 配置的 contextWindow > registry 的 contextWindow
  // 配置的 headers 合并到 registry 的 headers
}
```

### 8.3 本地 Provider 友好错误

```typescript
const LOCAL_PROVIDER_HINTS: Record<string, string> = {
  ollama:
    "Ollama requires authentication to be registered as a provider. " +
    'Set OLLAMA_API_KEY="ollama-local" (any value works) or run "openclaw configure".',
  vllm:
    "vLLM requires authentication to be registered as a provider. " +
    'Set VLLM_API_KEY (any value works) or run "openclaw configure".',
};

function buildUnknownModelError(provider: string, modelId: string): string {
  const hint = LOCAL_PROVIDER_HINTS[provider.toLowerCase()];
  return hint ? `Unknown model: ${provider}/${modelId}. ${hint}` : `Unknown model: ${provider}/${modelId}`;
}
```

---

## 9. 数据流总览

```
┌─────────────────────────────────────────────────────────────────┐
│  1. 用户配置 (openclaw.json)                                      │
│     agents.defaults.model: "anthropic/sonnet-4-5"               │
│     models.providers.anthropic: { apiKey: "sk-..." }            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. defaults.ts                                                  │
│     DEFAULT_PROVIDER = "anthropic"                               │
│     DEFAULT_MODEL = "claude-opus-4-6"                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. models-config.ts + models-config.plan.ts                     │
│     ├─ 合并显式 + 隐式 providers                                  │
│     ├─ 规范化 provider 配置（API key、baseUrl）                    │
│     └─ 决定 models.json: skip/noop/write                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. models.json（磁盘文件）                                       │
│     包含所有已发现 provider 的完整配置                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. model-catalog.ts                                             │
│     ├─ 加载 Pi SDK ModelRegistry                                 │
│     ├─ 合并 provider plugins 的补充模型                           │
│     └─ 返回 ModelCatalogEntry[]（带缓存）                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. model-selection.ts                                          │
│     ├─ 解析 "sonnet-4-5" → {provider: "anthropic", model: "..."} │
│     ├─ 查找别名                                                   │
│     ├─ 检查 allowlist                                             │
│     └─ 返回 ModelRef + key（"anthropic/sonnet-4-5"）              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. model-fallback.ts                                            │
│     ├─ 构建候选列表：[primary, ...fallbacks]                      │
│     ├─ 检查 cooldown 状态                                         │
│     └─ 依次尝试，直到成功或全部失败                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  8. pi-embedded-runner/model.ts                                 │
│     ├─ 查询 registry → inline provider → plugin → synthetic       │
│     ├─ 应用配置覆盖                                               │
│     └─ 返回可执行的 Model<Api> 对象                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. 设计亮点与经验总结

### 10.1 安全性设计

| 实践 | 具体做法 |
|------|----------|
| **文件权限** | `models.json` 写入后立即 `chmod 0o600` |
| **原子写入** | 写 `.tmp` 文件再 rename，避免损坏 |
| **环境隔离** | 不修改 `process.env`，用独立副本 |
| **Secret 标记** | 敏感值转换为环境变量名标记（如 `ENV:VAR_NAME`） |
| **最小权限** | 每个函数只请求需要的权限（如 `allowKeychainPrompt: false`） |

### 10.2 健壮性设计

| 实践 | 具体做法 |
|------|----------|
| **缓存失效** | 失败时清除 Promise 缓存，下次重试 |
| **优雅降级** | catalog 加载失败时返回已收集的部分结果 |
| **日志去重** | 使用 `hasLoggedModelCatalogError` 防止刷屏 |
| **并发安全** | 使用 Promise 队列而非简单 boolean 缓存 |
| **探针机制** | Cooldown 期间定期探测，避免永久阻塞 |

### 10.3 可维护性设计

| 实践 | 具体做法 |
|------|----------|
| **类型安全** | 所有数据流使用强类型，无 `any` |
| **分层解耦** | 7 个文件各司其职，依赖方向单一 |
| **注释密集** | 每个 tricky 逻辑都有注释解释为什么 |
| **错误信息** | 提供上下文丰富的错误信息（如本地 provider 提示） |

### 10.4 配置灵活性

| 需求 | 解决方案 |
|------|----------|
| 用户只写模型名 | Provider 默认为 `anthropic`，日志警告 |
| 模型未在 catalog | 合成 catalog entry，仍可配置使用 |
| 多 profile 切换 | 按优先级尝试每个 profile 的认证 |
| 跨 provider fallback | 只有同 provider 时才使用完整 fallback 链 |

---

## 附录：关键文件索引

| 文件 | 职责 |
|------|------|
| `src/agents/defaults.ts` | 硬编码默认值 |
| `src/agents/models-config.ts` | 确保 models.json 存在，安全写入 |
| `src/agents/models-config.plan.ts` | 判断 models.json 写入策略 |
| `src/agents/models-config.providers.ts` | Provider 发现与规范化 |
| `src/agents/models-config.merge.ts` | 显式/隐式 provider 合并 |
| `src/agents/model-catalog.ts` | 从 Pi SDK 加载模型目录，带缓存 |
| `src/agents/model-selection.ts` | 别名解析、allowlist、provider 规范化 |
| `src/agents/model-fallback.ts` | 失败回退、cooldown、探针 |
| `src/agents/pi-embedded-runner/model.ts` | 最终模型解析，三层查询 |
| `src/agents/pi-model-discovery.ts` | Pi SDK AuthStorage/ModelRegistry 初始化 |
