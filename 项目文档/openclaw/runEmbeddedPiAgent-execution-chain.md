# runEmbeddedPiAgent 运行链路深度剖析

> 本文档面向想要学习 Agent 开发的读者，通过逐行解析 `runEmbeddedPiAgent` 的源码，揭示一条生产级 Agent 执行路径的完整设计细节。

---

## 目录

1. [函数签名与核心职责](#1-函数签名与核心职责)
2. [Lane 解析：双层入队的根基](#2-lane-解析双层入队的根基)
3. [双层入队：session-lane--global-lane](#3-双层入队session-lane--global-lane)
4. [执行准备阶段](#4-执行准备阶段)
5. [主循环：while-true-的深层逻辑](#5-主循环while-true-的深层逻辑)
6. [上下文窗口检查](#6-上下文窗口检查)
7. [Auth-Profile 选择与轮换](#7-auth-profile-选择与轮换)
8. [运行尝试：runEmbeddedAttempt](#8-运行尝试runembeddedattempt)
9. [Compaction 恢复机制](#9-compaction-恢复机制)
10. [Tool-Result 截断](#10-tool-result-截断)
11. [Think-Level 降级](#11-think-level-降级)
12. [FailoverError 抛出](#12-failovererror-抛出)
13. [返回结果结构](#13-返回结果结构)
14. [完整流程图](#14-完整流程图)
15. [小白版核心问答](#15-小白版核心问答)

---

## 1. 函数签名与核心职责

**文件**：`src/agents/pi-embedded-runner/run.ts:265`

```typescript
export async function runEmbeddedPiAgent(
  params: RunEmbeddedPiAgentParams,
): Promise<EmbeddedPiRunResult>
```

**函数职责**：这是嵌入式 PI Agent 的主执行引擎，负责接收提示词、通过 AI 模型运行 Agent、收集流式响应、处理各种失败情况，最终返回结构化结果。

**输入参数核心字段**（`RunEmbeddedPiAgentParams`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionKey` | `string` | 会话唯一标识 |
| `sessionId` | `string` | 会话 ID |
| `prompt` | `string` | Agent 提示词（已构建好的） |
| `provider` | `string` | 模型提供商（如 `openai`） |
| `model` | `string` | 模型名称（如 `gpt-4o`） |
| `config` | `OpenClawConfig` | 完整配置对象 |
| `tools` | 内含于其他参数 | 工具集通过 `skillsSnapshot` 等传入 |
| `abortSignal` | `AbortSignal` | 中止信号 |
| `onPartialReply` | 回调 | 部分文本回复回调 |
| `onBlockReply` | 回调 | 完整回复块回调 |
| `onToolResult` | 回调 | 工具执行结果回调 |
| `lane` | `string?` | 全局 Lane 标识 |

**输出结果**（`EmbeddedPiRunResult`）：

```typescript
{
  payloads?: ReplyPayload_Block[];   // 回复内容块
  meta: {
    durationMs: number;              // 执行耗时
    agentMeta: EmbeddedPiAgentMeta; // 包含 usage、sessionId 等
    aborted?: boolean;
    systemPromptReport?: ...;
    stopReason?: string;
    pendingToolCalls?: ...;         // 客户端工具调用
  };
  didSendViaMessagingTool?: boolean;
  messagingToolSentTexts?: string[];
  // ...
}
```

---

## 2. Lane 解析：双层入队的根基

**文件**：`src/agents/pi-embedded-runner/lanes.ts`

```typescript
// 源码
export function resolveSessionLane(key: string) {
  const cleaned = key.trim() || CommandLane.Main;
  return cleaned.startsWith("session:") ? cleaned : `session:${cleaned}`;
}

export function resolveGlobalLane(lane?: string) {
  const cleaned = lane?.trim();
  // Cron jobs hold the cron lane slot; inner operations must use nested to avoid deadlock.
  if (cleaned === CommandLane.Cron) {
    return CommandLane.Nested;
  }
  return cleaned ? cleaned : CommandLane.Main;
}
```

### 2.1 Session Lane 解析

**关键逻辑**：确保 session key 有 `session:` 前缀。

```
输入: "abc123"          → 输出: "session:abc123"
输入: "session:abc123" → 输出: "session:abc123"  (不变)
输入: ""                → 输出: "session:main"    (默认)
输入: "  abc  "         → 输出: "session:abc"    (trim)
```

### 2.2 Global Lane 解析

**关键逻辑**：
- 如果请求的 lane 是 `Cron`，映射到 `Nested`
  - **为什么？** 因为 Cron 任务本身持有 `Cron` lane，如果内部操作继续使用 `Cron` lane，会形成死锁：
    ```
    Cron Job A (持有 Cron lane)
      → 等待资源 X
        → 资源 X 被 Cron Job B 等待
          → Cron Job B (也持有 Cron lane) → 死锁！
    ```
  - 映射到 `Nested` 后，A 和 B 可以在不同 lane 中并行
- 如果 lane 为空，默认使用 `Main`

### 2.3 Lane 的物理意义

Lane 是**命令队列**中的执行通道，每个 lane 有独立的队列和并发控制。

| Lane 名称 | 用途 | 默认并发 |
|-----------|------|---------|
| `Main` | 主工作队列 | 1（可配置） |
| `Cron` | 定时任务 | 1 |
| `Nested` | 嵌套/内部操作 | 1 |
| `session:xxx` | 会话隔离 | 1 |
| `Subagent` | 子 Agent | 可配置 |

---

## 3. 双层入队：session-lane + global-lane

**源码**（第 284-285 行）：

```typescript
return enqueueSession(() =>
  enqueueGlobal(async () => {
    // ... 整个执行逻辑
  }),
);
```

**实际展开后**：

```typescript
return enqueueCommandInLane(sessionLane, () =>
  enqueueCommandInLane(globalLane, async () => {
    // ... 整个执行逻辑
  }),
);
```

### 3.1 双层入队的执行顺序

```
用户消息到达
    │
    ▼
入队到 sessionLane (session:abc123)
    │
    ├── [队列中等待] ← 同一会话的其他消息在这里排队
    │
    ▼ [轮到本任务]
执行 enqueueGlobal(async () => {
    │
    ├── 入队到 globalLane (Main)
    │       │
    │       ├── [队列中等待] ← 其他会话的任务在这里排队
    │       │
    │       ▼ [轮到本任务]
    │       执行完整的 Agent 运行逻辑
    │           │
    │           ▼
    │       返回结果
    │
    ▼ 返回结果
返回给调用者
```

### 3.2 为什么需要双层？

**第一层：sessionLane（会话隔离）**

保证**同一会话的消息串行处理**。考虑这个场景：

```
用户连发 3 条消息:
Message 1 → 入队 sessionLane:session123
Message 2 → 入队 sessionLane:session123
Message 3 → 入队 sessionLane:session123

执行顺序：
Message 1 开始执行（持有锁）
Message 1 完成，释放锁
Message 2 开始执行
Message 2 完成，释放锁
Message 3 开始执行
```

如果 Message 1 和 Message 2 并行执行，Agent 可能会看到**乱序的上下文**，导致对话混乱。

**第二层：globalLane（全局资源控制）**

控制**全局共享资源的并发访问**。例如：
- API 限流：所有会话共享同一个 API 的 rate limit
- 内存压力：避免同时运行太多 Agent 耗尽内存
- 日志顺序：保证日志输出的可读性

**关键理解**：session lane 和 global lane 是**嵌套关系**，不是平级关系。

```
enqueueSession(() =>
  enqueueGlobal(() => {
    // 实际执行
  })
)
```

session lane 在外层，global lane 在内层。这意味着：
- 首先，session lane 保证同一会话串行
- 然后，global lane 在该会话内控制全局资源并发

### 3.3 enqueueCommandInLane 的实现要点

**文件**：`src/process/command-queue.ts`

```typescript
export function enqueueCommandInLane<T>(
  lane: string,
  task: () => Promise<T>,
  opts?: {
    taskId?: number;
    warnAfterMs?: number;
    onWait?: (waitMs: number, queuedAhead: number) => void;
  },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const entry: QueueEntry = {
      task,
      resolve,
      reject,
      enqueuedAt: Date.now(),
      // ...
    };

    // 加入队列
    laneState.queue.push(entry);

    // 如果有容量，立即执行
    // 否则等待
    drainLane(lane);
  });
}
```

核心机制：
- 返回 **Promise**，调用者等待执行完成
- **自动管理并发**：如果当前运行数 < `maxConcurrent`，立即执行
- **等待回调**：`onWait` 通知调用者等待了多久

---

## 4. 执行准备阶段

### 4.1 工作区目录解析

**源码**（第 286-301 行）：

```typescript
const workspaceResolution = resolveRunWorkspaceDir({
  workspaceDir: params.workspaceDir,
  sessionKey: params.sessionKey,
  agentId: params.agentId,
  config: params.config,
});
const resolvedWorkspace = workspaceResolution.workspaceDir;

// 如果使用了 fallback，记录警告日志
if (workspaceResolution.usedFallback) {
  log.warn(`[workspace-fallback] ...`);
}
```

**为什么需要 workspace？** Agent 可能需要读写文件系统，workspace 定义了操作的根目录。

### 4.2 运行时插件加载

**源码**（第 302-305 行）：

```typescript
ensureRuntimePluginsLoaded({
  config: params.config,
  workspaceDir: resolvedWorkspace,
});
```

加载为这个 Agent/会话配置的插件，如自定义工具或通道适配器。

### 4.3 模型 JSON 确保存在

**源码**（第 316 行）：

```typescript
await ensureOpenClawModelsJson(params.config, agentDir);
```

确保 `~/.openclaw/models.json` 存在（包含模型配置如 context window、支持的特性等）。

### 4.4 Hook 驱动的 Model 覆盖

**源码**（第 318-371 行）：

```typescript
// 运行 before_model_resolve hooks（允许插件覆盖 provider/model）
if (hookRunner?.hasHooks("before_model_resolve")) {
  modelResolveOverride = await hookRunner.runBeforeModelResolve({ prompt: params.prompt }, hookCtx);
}

// 也检查 legacy before_agent_start hook
if (hookRunner?.hasHooks("before_agent_start")) {
  legacyBeforeAgentStartResult = await hookRunner.runBeforeAgentStart({ prompt: params.prompt }, hookCtx);
}

// 应用覆盖
if (modelResolveOverride?.providerOverride) {
  provider = modelResolveOverride.providerOverride;
}
if (modelResolveOverride?.modelOverride) {
  modelId = modelResolveOverride.modelOverride;
}
```

**为什么需要 hook 覆盖？** 允许插件根据提示词内容动态决定使用哪个模型，例如：
- 代码相关任务 → 切换到更强的模型
- 简单问答 → 切换到更便宜的模型

### 4.5 模型解析

**源码**（第 373-385 行）：

```typescript
const { model, error, authStorage, modelRegistry } = await resolveModelAsync(
  provider,
  modelId,
  agentDir,
  params.config,
);

if (!model) {
  throw new FailoverError(error ?? `Unknown model: ${provider}/${modelId}`, {
    reason: "model_not_found",
    provider,
    model: modelId,
  });
}
```

解析模型配置，如果模型不存在则抛出 `FailoverError`（将被外层 `runAgentTurnWithFallback` 捕获并尝试备用模型）。

---

## 5. 主循环：while-true 的深层逻辑

**源码**（第 885-1696 行）：

```typescript
while (true) {
  if (runLoopIterations >= MAX_RUN_LOOP_ITERATIONS) {
    // 超过最大重试次数，返回错误
    return { payloads: [{ text: "Request failed after repeated internal retries.", isError: true }], ... };
  }

  runLoopIterations += 1;

  // ... 执行 attempt

  const { aborted, promptError, timedOut, timedOutDuringCompaction, sessionIdUsed, lastAssistant } = attempt;

  // 1. Context Overflow 处理
  if (contextOverflowError) {
    // compaction 或 truncation
    continue;
  }

  // 2. Prompt Error 处理
  if (promptError) {
    // 认证刷新、profile 轮换、think level 降级
    continue;
  }

  // 3. Assistant Error 处理
  if (lastAssistant?.errorMessage) {
    // profile 轮换、throw FailoverError
  }

  // 4. 成功路径
  return { payloads, meta, ... };
}
```

### 5.1 循环次数限制

```typescript
const MAX_RUN_LOOP_ITERATIONS = resolveMaxRunRetryIterations(profileCandidates.length);
```

**计算公式**：

```typescript
function resolveMaxRunRetryIterations(profileCandidateCount: number): number {
  const scaled =
    BASE_RUN_RETRY_ITERATIONS +
    Math.max(1, profileCandidateCount) * RUN_RETRY_ITERATIONS_PER_PROFILE;
  return Math.min(MAX_RUN_RETRY_ITERATIONS, Math.max(MIN_RUN_RETRY_ITERATIONS, scaled));
}
```

默认值：
- `BASE_RUN_RETRY_ITERATIONS = 24`
- `RUN_RETRY_ITERATIONS_PER_PROFILE = 8`
- `MIN_RUN_RETRY_ITERATIONS = 32`
- `MAX_RUN_RETRY_ITERATIONS = 160`

**实际意义**：如果有 2 个 auth profile，最大重试次数是 `24 + 2*8 = 40` 次。

### 5.2 循环不退出意味着什么？

`while(true)` 看起来是死循环，但实际上有多个退出路径：

| 退出方式 | 条件 | 结果 |
|----------|------|------|
| `return` | 成功完成 | 返回 payloads |
| `return` | 错误（context overflow、retry limit 等） | 返回错误 payloads |
| `throw FailoverError` | 可恢复的错误（限流、认证等） | 外层 `runAgentTurnWithFallback` 捕获，尝试备用模型 |
| `throw` 其他错误 | 不可恢复的错误 | 向上传播 |

### 5.3 为什么要用 while(true) + continue？

**这是经典的"重试循环"模式**，而不是 for 循环。原因：

1. **重试次数不固定**：可能在中间某次重试时成功，不应该用固定次数限制
2. **多种恢复路径**：compaction 成功后可以继续，profile 轮换后也可以继续
3. **提前退出**：`MAX_RUN_LOOP_ITERATIONS` 是安全网，不是预期路径

---

## 6. 上下文窗口检查

**源码**（第 388-419 行）：

```typescript
const ctxInfo = resolveContextWindowInfo({
  cfg: params.config,
  provider,
  modelId,
  modelContextWindow: runtimeModel.contextWindow,
  defaultTokens: DEFAULT_CONTEXT_TOKENS,
});

// 如果配置了更小的 token 上限，应用它
let effectiveModel =
  ctxInfo.tokens < (runtimeModel.contextWindow ?? Infinity)
    ? { ...runtimeModel, contextWindow: ctxInfo.tokens }
    : runtimeModel;

// 检查是否低于安全阈值
const ctxGuard = evaluateContextWindowGuard({
  info: ctxInfo,
  warnBelowTokens: CONTEXT_WINDOW_WARN_BELOW_TOKENS,
  hardMinTokens: CONTEXT_WINDOW_HARD_MIN_TOKENS,
});

if (ctxGuard.shouldWarn) {
  log.warn(`low context window: ${provider}/${modelId} ctx=${ctxGuard.tokens} ...`);
}

if (ctxGuard.shouldBlock) {
  throw new FailoverError(
    `Model context window too small (${ctxGuard.tokens} tokens). Minimum is ${CONTEXT_WINDOW_HARD_MIN_TOKENS}.`,
    { reason: "unknown", provider, model: modelId },
  );
}
```

### 6.1 为什么提前检查上下文窗口？

**太小的模型会直接失败或行为异常**。例如：

```
模型 context window: 4,096 tokens
当前对话历史: 3,800 tokens
新消息: 500 tokens
总计: 4,300 tokens > 4,096
```

如果不做提前检查，模型 API 会返回错误（`context_length_exceeded`），然后：
1. 浪费一次 API 调用
2. 增加延迟（网络往返）
3. 用户体验差

**提前拦截**的收益：
- 立即返回用户友好的错误消息
- 可以尝试 compaction 而非直接失败
- 节省 API 调用成本

### 6.2 阈值定义

```typescript
const CONTEXT_WINDOW_WARN_BELOW_TOKENS = 32_768;  // 32K 以下警告
const CONTEXT_WINDOW_HARD_MIN_TOKENS = 2_048;     // 2K 以下直接拒绝
```

**设计意图**：4K 以下的模型（如某些 GPT-3.5 配置）被认为是"太小了"，不值得尝试。

---

## 7. Auth Profile 选择与轮换

### 7.1 Auth Profile 概念

Auth Profile 是**一组认证凭据**（API Key），可能来自：
- 用户配置的多个 key
- 通过 OAuth 获取的 token
- 从密钥管理器解析的临时凭据

```typescript
type AuthProfile = {
  id: string;
  provider: string;
  apiKey: string;
  expiresAt?: number;  // OAuth token 过期时间
  cooldownUntil?: number;  // 限流后的冷却
};
```

### 7.2 Profile 候选列表构建

**源码**（第 442-446 行）：

```typescript
const profileCandidates = lockedProfileId
  ? [lockedProfileId]  // 用户锁定，只用这一个
  : profileOrder.length > 0
    ? profileOrder      // 从配置中解析的顺序
    : [undefined];      // 无 profile，使用默认 key
```

**优先级**：
1. 如果用户指定了 `authProfileId`（`lockedProfileId`），只用这一个
2. 否则使用配置中的 profile 顺序
3. 最后回退到"无 profile"（直接使用默认 API key）

### 7.3 Profile 轮换：advanceAuthProfile

**源码**（第 710-735 行）：

```typescript
const advanceAuthProfile = async (): Promise<boolean> => {
  if (lockedProfileId) {
    return false;  // 用户锁定，不轮换
  }

  let nextIndex = profileIndex + 1;
  while (nextIndex < profileCandidates.length) {
    const candidate = profileCandidates[nextIndex];

    // 跳过在 cooldown 中的 profile
    if (candidate && isProfileInCooldown(authStore, candidate)) {
      nextIndex += 1;
      continue;
    }

    try {
      await applyApiKeyInfo(candidate);
      profileIndex = nextIndex;
      thinkLevel = initialThinkLevel;       // 重置 think level
      attemptedThinking.clear();            // 清空已尝试的 think 级别
      return true;
    } catch (err) {
      nextIndex += 1;
    }
  }
  return false;
};
```

**为什么轮换可以解决问题？**

1. **Rate Limit**：Profile A 达到 API 限流 → 切换到 Profile B（不同的 API key，限额独立）
2. **Auth Error**：Profile A 的 token 过期 → 切换到 Profile B（refresh token 可能还有效）
3. **Billing**：Profile A 达到账单限额 → 切换到 Profile B

### 7.4 为什么 Auth Profile 要轮换？

**同一个 provider 可能配置了多个 key/profile**。场景：

```
用户配置：
profiles:
  - id: profile-1
    apiKey: sk-xxx-1  (限流: 100 req/min)
  - id: profile-2
    apiKey: sk-xxx-2  (限流: 100 req/min)
```

当 profile-1 被限流时：
```typescript
// 检测到限流
await maybeMarkAuthProfileFailure({
  profileId: lastProfileId,
  reason: "rate_limit",  // 记录失败原因
});

// 尝试轮换
const rotated = await advanceAuthProfile();
if (rotated) {
  continue;  // 使用 profile-2 重试
}
```

### 7.5 Cooldown 机制

**防止在冷却期间重复尝试失败的 profile**：

```typescript
// 检查 profile 是否在 cooldown 中
if (candidate && isProfileInCooldown(authStore, candidate)) {
  nextIndex += 1;
  continue;
}
```

**Cooldown 来源**：当 profile 失败时记录，下次轮换时跳过：

```typescript
await markAuthProfileFailure({
  store: authStore,
  profileId,
  reason,  // "rate_limit", "auth", "billing" 等
  cfg: params.config,
  agentDir,
  runId: params.runId,
});
```

---

## 8. 运行尝试：runEmbeddedAttempt

**源码**（第 927-1000 行）：

```typescript
const attempt = await runEmbeddedAttempt({
  sessionId: params.sessionId,
  sessionKey: params.sessionKey,
  prompt,
  provider,
  modelId,
  model: effectiveModel,
  authProfileId: lastProfileId,
  thinkLevel,
  timeoutMs: params.timeoutMs,
  abortSignal: params.abortSignal,
  onPartialReply: params.onPartialReply,
  onBlockReply: params.onBlockReply,
  onToolResult: params.onToolResult,
  // ... 更多参数
});
```

### 8.1 runEmbeddedAttempt 的职责

**文件**：`src/agents/pi-embedded-runner/run/attempt.ts`

这是**最小执行单元**，负责：
1. 调用 AI Provider API（OpenAI / Anthropic / Google / etc.）
2. 处理流式响应
3. 执行工具调用循环
4. 返回结果或错误

### 8.2 Attempt 结果解构

```typescript
const {
  aborted,
  promptError,
  timedOut,
  timedOutDuringCompaction,
  sessionIdUsed,
  lastAssistant,           // 最后的 assistant 消息
  assistantTexts,          // 累积的文本片段
  toolMetas,               // 工具调用元信息
  compactionCount,         // compaction 次数
  messagesSnapshot,        // 消息快照（用于 truncation）
  bootstrapPromptWarningSignaturesSeen,
  attemptUsage,            // 本次尝试的 usage
} = attempt;
```

### 8.3 成功 vs 失败的判断

**成功**：没有 `promptError`，且 `lastAssistant` 有内容。

**失败**：
- `promptError`：提示词提交阶段出错
- `lastAssistant.errorMessage`：模型返回了错误
- `aborted`：被中止
- `timedOut`：超时

---

## 9. Compaction 恢复机制

### 9.1 什么是 Compaction？

Compaction（压缩）是**上下文溢出恢复**机制：当对话历史太长、超过模型 context window 时：
1. 总结之前的对话
2. 删除详细的消息
3. 用摘要替换

### 9.2 溢出检测

**源码**（第 1047-1063 行）：

```typescript
const contextOverflowError = !aborted
  ? (() => {
      if (promptError) {
        const errorText = describeUnknownError(promptError);
        if (isLikelyContextOverflowError(errorText)) {
          return { text: errorText, source: "promptError" as const };
        }
        return null;
      }
      if (assistantErrorText && isLikelyContextOverflowError(assistantErrorText)) {
        return { text: assistantErrorText, source: "assistantError" as const };
      }
      return null;
    })()
  : null;
```

两种溢出来源：
1. **Prompt Error**：提示词提交时 API 返回 context overflow
2. **Assistant Error**：模型在处理时检测到上下文问题

### 9.3 Compaction 执行流程

**源码**（第 1107-1199 行）：

```typescript
if (
  !isCompactionFailure &&
  !hadAttemptLevelCompaction &&
  overflowCompactionAttempts < MAX_OVERFLOW_COMPACTION_ATTEMPTS
) {
  overflowCompactionAttempts++;

  // 调用 context engine 执行 compaction
  const compactResult = await contextEngine.compact({
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    tokenBudget: ctxInfo.tokens,
    force: true,
    compactionTarget: "budget",
    runtimeContext: { ... },
  });

  if (compactResult.compacted) {
    autoCompactionCount += 1;
    log.info(`auto-compaction succeeded for ${provider}/${modelId}; retrying prompt`);
    continue;  // 重新进入 while 循环，重试
  }
}
```

### 9.4 为什么需要多次尝试？

**Compaction 可能不够充分**：

```
第一次溢出:
  历史 500 条消息 → compaction → 200 条消息
  200 条消息 + 新消息 = 210 条 → 仍然溢出

第二次溢出:
  历史 200 条消息 → compaction → 100 条消息
  100 条消息 + 新消息 = 110 条 → 成功
```

**最大尝试次数**：`MAX_OVERFLOW_COMPACTION_ATTEMPTS = 3`

---

## 10. Tool-Result 截断

### 10.1 问题场景

有时候**单个工具结果太大**，超过了 context window：

```
用户上传了一个 10MB 的日志文件
Agent 使用 read 工具读取
工具返回了 100,000 tokens 的内容
context window: 128,000 tokens
现有历史: 20,000 tokens
总计: 120,000 tokens + 100,000 tokens = 220,000 tokens > 128,000
```

Compaction **无法处理**这种情况，因为 compaction 是总结对话，不能删除单个工具结果。

### 10.2 截断策略

**源码**（第 1205-1246 行）：

```typescript
// 检测是否有超大的工具结果
const hasOversized = attempt.messagesSnapshot
  ? sessionLikelyHasOversizedToolResults({
      messages: attempt.messagesSnapshot,
      contextWindowTokens: ctxInfo.tokens,
    })
  : false;

if (hasOversized) {
  // 截断超大的工具结果
  const truncResult = await truncateOversizedToolResultsInSession({
    sessionFile: params.sessionFile,
    contextWindowTokens: ctxInfo.tokens,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
  });

  if (truncResult.truncated) {
    log.info(`[context-overflow-recovery] Truncated ${truncResult.truncatedCount} tool result(s); retrying prompt`);
    continue;  // 重试
  }
}
```

**截断策略**：
- 保留工具调用的**结构**（函数名、参数）
- 截断**返回值**的详细内容
- 添加标记 `[内容已截断，原文件大小: X bytes]`

### 10.3 与 Compaction 的区别

| | Compaction | Truncation |
|---|---|---|
| **对象** | 对话历史（多条消息） | 单个工具结果 |
| **方法** | 总结 + 压缩 | 裁剪内容 |
| **触发** | 对话太长 | 单个工具结果太大 |

---

## 11. Think-Level 降级

### 11.1 什么是 Think-Level？

某些模型支持不同的思考级别，例如：
- `off`：不进行推理
- `low`：轻量推理
- `medium`：标准推理
- `high`：深度推理

### 11.2 降级场景

**模型不支持请求的思考级别时**：

```typescript
// 源码第 1402-1411 行
const fallbackThinking = pickFallbackThinkingLevel({
  message: errorText,
  attempted: attemptedThinking,
});
if (fallbackThinking) {
  log.warn(`unsupported thinking level for ${provider}/${modelId}; retrying with ${fallbackThinking}`);
  thinkLevel = fallbackThinking;
  continue;
}
```

**典型错误消息**：
```
"model does not support thinking level 'high'"
```

**降级链**：`high` → `medium` → `low` → `off`

### 11.3 为什么需要降级？

因为**不同模型支持不同的思考级别**：

```
请求: thinkLevel = "high"
模型: GPT-4o-mini（不支持 high）

结果: API 返回错误

降级后重试:
  thinkLevel = "medium"
  模型支持 → 成功
```

---

## 12. FailoverError 抛出

### 12.1 什么时候抛出 FailoverError？

当**当前模型不可用，但可能有其他模型可用**时：

```typescript
// 源码第 1416-1429 行
if (fallbackConfigured && promptFailoverFailure) {
  const status = resolveFailoverStatus(promptFailoverReason ?? "unknown");
  logPromptFailoverDecision("fallback_model", { status });
  await maybeBackoffBeforeOverloadFailover(promptFailoverReason);

  throw new FailoverError(errorText, {
    reason: promptFailoverReason ?? "unknown",
    provider,
    model: modelId,
    profileId: lastProfileId,
    status: resolveFailoverStatus(promptFailoverReason ?? "unknown"),
  });
}
```

### 12.2 谁来处理 FailoverError？

**外层函数**：`runAgentTurnWithFallback`（在 `agent-runner-execution.ts` 中）

```typescript
// 伪代码
for (const candidate of fallbackChain) {
  try {
    const result = await runEmbeddedPiAgent(params);
    return result;
  } catch (err) {
    if (err instanceof FailoverError) {
      // 尝试下一个模型
      continue;
    }
    throw err;  // 其他错误直接抛出
  }
}
```

### 12.3 FailoverReason 类型

```typescript
type FailoverReason =
  | "rate_limit"      // API 限流
  | "overloaded"      // 服务器过载
  | "auth"           // 认证失败
  | "auth_permanent" // 永久认证失败
  | "billing"        // 计费问题
  | "timeout"        // 超时
  | "context_overflow" // 上下文溢出
  | "model_not_found" // 模型不存在
  | "unknown";       // 未知错误
```

---

## 13. 返回结果结构

### 13.1 成功返回

```typescript
return {
  payloads: payloads.length ? payloads : undefined,
  meta: {
    durationMs: Date.now() - started,
    agentMeta: {
      sessionId: sessionIdUsed,
      provider: lastAssistant?.provider ?? provider,
      model: lastAssistant?.model ?? model.id,
      usage,              // 累积的 usage
      lastCallUsage,      // 最后一次调用的 usage
      promptTokens,       // 提示词 token 数
      compactionCount,    // compaction 次数
    },
    aborted,
    systemPromptReport,
    stopReason,           // 停止原因: "end_turn" | "max_tokens" | "tool_calls"
    pendingToolCalls,     // 待处理的工具调用
  },
  didSendViaMessagingTool,
  messagingToolSentTexts,
  // ...
};
```

### 13.2 错误返回

**Context Overflow 错误**：

```typescript
return {
  payloads: [{
    text: "Context overflow: prompt too large for the model. " +
          "Try /reset (or /new) to start a fresh session, or use a larger-context model.",
    isError: true,
  }],
  meta: {
    durationMs: Date.now() - started,
    agentMeta: buildErrorAgentMeta({ ... }),
    systemPromptReport: attempt.systemPromptReport,
    error: { kind: "context_overflow" | "compaction_failure", message: errorText },
  },
};
```

### 13.3 Payloads 是什么？

```typescript
type ReplyPayload_Block =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string }
  | { kind: "tool_use"; tool: string; input: object }
  | { kind: "tool_result"; tool: string; result: unknown }
  | { kind: "error"; text: string; isError: true };
```

**为什么返回数组？** 因为一次运行可能产生多个回复块（例如：先输出思考，再输出回复）。

---

## 14. 完整流程图

```
runEmbeddedPiAgent(params)
    │
    ├─► resolveSessionLane(sessionKey) → session:xxx
    ├─► resolveGlobalLane(lane) → Main / Nested
    │
    ├─► enqueueSession(() =>
    │     enqueueGlobal(async () => {
    │
    │     // === 执行准备 ===
    │     ├─► resolveRunWorkspaceDir()
    │     ├─► ensureRuntimePluginsLoaded()
    │     ├─► ensureOpenClawModelsJson()
    │     ├─► before_model_resolve hooks (可覆盖 provider/model)
    │     ├─► resolveModelAsync() → 获取模型配置
    │     ├─► resolveContextWindowInfo() → 上下文窗口信息
    │     ├─► evaluateContextWindowGuard() → 太小的模型直接拒绝
    │     ├─► ensureAuthProfileStore() → 认证凭据存储
    │     └─► resolveAuthProfileOrder() → profile 候选列表
    │
    │     // === 主循环 while(true) ===
    │     while (true) {
    │       │
    │       ├─► [迭代次数 >= MAX] → return 错误
    │       │
    │       ├─► runLoopIterations++
    │       │
    │       ├─► runEmbeddedAttempt()
    │       │     │
    │       │     ├─► API 调用
    │       │     ├─► 流式响应处理
    │       │     └─► 工具执行循环
    │       │
    │       ├─► 解构 attempt 结果
    │       │
    │       ├─► [Context Overflow?]
    │       │     ├─► [未尝试过 compaction?] → compact() → continue
    │       │     ├─► [compact 失败?] → truncateOversizedToolResults() → continue
    │       │     └─► [仍失败] → return 错误 payload
    │       │
    │       ├─► [Prompt Error?]
    │       │     ├─► [认证错误?] → refreshRuntimeAuth() → continue
    │       │     ├─► [profile 可轮换?] → advanceAuthProfile() → continue
    │       │     ├─► [think level 可降级?] → pickFallbackThinkingLevel() → continue
    │       │     ├─► [fallback configured?] → throw FailoverError
    │       │     └─► [否] → throw promptError
    │       │
    │       ├─► [Assistant Error?]
    │       │     ├─► [认证错误?] → refreshRuntimeAuth() → continue
    │       │     ├─► [shouldRotate?] → advanceAuthProfile() → continue
    │       │     ├─► [fallback configured?] → throw FailoverError
    │       │     └─► [否] → 继续处理
    │       │
    │       └─► [成功] → buildEmbeddedRunPayloads() → return 成功结果
    │     }
    │
    └─► 返回 Promise resolves
```

---

## 15. 小白版核心问答

### Q1: 为什么是"双 lane"？

**答**：session lane 和 global lane 是**嵌套关系**。

- **session lane 在外层**：保证**同一会话的消息串行处理**。如果两条消息同时处理，Agent 可能看到乱序的对话历史。

- **global lane 在内层**：控制**全局资源**的并发。例如避免同时运行太多 Agent 耗尽 API 限流或内存。

**形象比喻**：
```
session lane = 电影院的自助餐队伍（同一会话一个个来）
global lane = 餐厅的厨师数量（全局共享的厨师）

你不能跳过 session lane 直接去 global lane，
因为需要先保证你的会话消息有序。
```

### Q2: 为什么先检查 context window？

**答**：**提前拦截比跑到中间崩溃更稳定**。

考虑不提前检查的情况：
```
1. 构建完整 prompt（可能 10MB）
2. 发送到 API
3. API 返回 "context length exceeded"
4. 浪费网络带宽、浪费时间、浪费费用
```

提前检查的好处：
- **立即返回友好错误**：告诉用户用 `/new` 开新会话
- **可尝试恢复**：在报错前就触发 compaction
- **节省资源**：避免无意义的 API 调用

### Q3: 为什么 auth profile 要轮换？

**答**：因为**同一个 provider 可能配置了多个 key**。

```
场景：用户配置了 3 个 API key

profile-1: sk-xxx-1 → 限流了 (100 req/min)
profile-2: sk-xxx-2 → 正常
profile-3: sk-xxx-3 → 正常

第一次调用 profile-1 → 限流失败
自动轮换到 profile-2 → 成功
```

**限流通常是 per-key 的**，不同的 key 有独立的限额。

### Q4: 为什么运行过程会循环？

**答**：`while(true)` 循环是**重试机制**，不是真的死循环。

**循环内可能的重试路径**：

```
第一次 attempt 失败
    │
    ├── Context Overflow → Compaction → continue (重试)
    │
    ├── 限流 → 等待 (backoff) → continue (重试)
    │
    ├── Auth Error → 刷新 token → continue (重试)
    │
    ├── Profile 失败 → 轮换到下一个 profile → continue (重试)
    │
    ├── Think Level 不支持 → 降级 → continue (重试)
    │
    └── 所有恢复手段用尽
          │
          ├── throw FailoverError → 外层尝试备用模型
          │
          └── return 错误给用户
```

**提前退出条件**：
- 成功返回
- 超过 `MAX_RUN_LOOP_ITERATIONS`（安全网）
- `throw FailoverError`（交给外层处理）

### Q5: 返回结果不只是文本？

**答**：`payloads` 是一个数组，包含多种类型的块：

```typescript
payloads: [
  { kind: "text", text: "我来帮你分析这个问题..." },        // 普通文本
  { kind: "tool_use", tool: "bash", input: {...} },       // 工具调用
  { kind: "tool_result", tool: "bash", result: "..." },   // 工具结果
  { kind: "reasoning", text: "思考过程..." },             // 思考（可选）
]
```

**为什么需要这么多类型？**
- **流式体验**：工具调用可以边执行边展示
- **调试友好**：能看到 Agent 调用了什么工具
- **后续处理**：上层可以决定如何展示给用户

**上层的责任**（`runAgentTurnWithFallback`）：
```typescript
// 根据 payloads 类型做不同处理
for (const payload of payloads) {
  switch (payload.kind) {
    case "text":
      sendToUser(payload.text);
      break;
    case "tool_use":
      // 执行工具，注入 tool_result
      break;
    // ...
  }
}
```

---

## 附录：关键常量速查表

| 常量 | 值 | 说明 |
|------|-----|------|
| `BASE_RUN_RETRY_ITERATIONS` | 24 | 基础最大重试次数 |
| `RUN_RETRY_ITERATIONS_PER_PROFILE` | 8 | 每个 profile 增加的重试次数 |
| `MIN_RUN_RETRY_ITERATIONS` | 32 | 最小最大重试次数 |
| `MAX_RUN_LOOP_ITERATIONS` | 160 | 最大重试次数上限 |
| `MAX_OVERFLOW_COMPACTION_ATTEMPTS` | 3 | Compaction 最大尝试次数 |
| `CONTEXT_WINDOW_WARN_BELOW_TOKENS` | 32,768 | 低于此值警告 |
| `CONTEXT_WINDOW_HARD_MIN_TOKENS` | 2,048 | 低于此值拒绝 |
| `RUNTIME_AUTH_REFRESH_MARGIN_MS` | 300,000 | 提前 5 分钟刷新 token |
| `OVERLOAD_FAILOVER_BACKOFF_POLICY.initialMs` | 250ms | 过载退避初始延迟 |
| `OVERLOAD_FAILOVER_BACKOFF_POLICY.maxMs` | 1,500ms | 过载退避最大延迟 |
