# OpenClaw Agent 核心模块深度剖析

> 本文档面向想要学习 Agent 开发的开发者，通过详细解析 OpenClaw 项目源码，揭示一个生产级 Agent 框架的架构设计与实现细节。

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [智能体执行主链](#2-智能体执行主链)
3. [工具与安全策略](#3-工具与安全策略)
4. [并发与会话隔离](#4-并发与会话隔离)
5. [流式回复与事件](#5-流式回复与事件)
6. [子智能体编排](#6-子智能体编排)
7. [技能系统](#7-技能系统)
8. [失败恢复](#8-失败恢复)
9. [Gateway 控制平面](#9-gateway-控制平面)
10. [Gateway HTTP 与生命周期](#10-gateway-http-与生命周期)
11. [协议层](#11-协议层)
12. [系统胶水层](#12-系统胶水层)
13. [架构问答自测](#13-架构问答自测)

---

## 1. 整体架构概览

### 1.1 系统的核心定位

OpenClaw 是一个多通道消息网关 + 嵌入式 AI Agent 运行时。它的设计目标是在单个进程中同时处理：

- **多渠道消息路由**：Telegram、Discord、Slack、WhatsApp 等
- **嵌入式 Agent 执行**：在消息处理流程中直接运行 AI Agent
- **外部 API 兼容**：同时暴露 OpenAI 和 OpenResponses 兼容的 HTTP 接口
- **节点管理**：允许多个客户端（CLI、Web、Node）连接到同一个 Gateway

理解这个系统最关键的一句话：**Gateway 是控制平面和数据平面的融合，Agent 是被 Gateway 调度的工作负载**。

### 1.2 模块分层图

```
┌─────────────────────────────────────────────────────────┐
│                    Gateway 进程                          │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              控制平面 (Control Plane)             │    │
│  │  WebSocket Server │ HTTP Server │ Config Reload │    │
│  │  Auth/Authz │ Node Registry │ Broadcast        │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                                │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │              协议层 (Protocol Layer)             │    │
│  │  validateRequestFrame │ ProtocolSchemas         │    │
│  │  GatewayFrameSchema │ PROTOCOL_VERSION=3       │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                                │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Agent 运行时 (Agent Runtime)        │    │
│  │  runAgentTurnWithFallback │ runEmbeddedPiAgent  │    │
│  │  createOpenClawCodingTools │ ToolPolicyPipeline │    │
│  │  subscribeEmbeddedPiSession │ ModelFallback     │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                                │
│                         ▼                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │              通道适配层 (Channel Adapters)       │    │
│  │  Telegram │ Discord │ Slack │ WhatsApp │ iMessage│   │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 1.3 数据流向总览

```
用户消息
    │
    ▼
Channel Adapter (src/telegram, src/discord, ...)
    │
    ▼
Command Queue (src/process/command-queue.ts)  ← 按 Lane 排队
    │
    ▼
Agent Runner (src/auto-reply/reply/agent-runner-execution.ts)
    │
    ├──► Model Fallback (src/agents/model-fallback.ts)
    │         │
    │         ▼
    │    Provider API (OpenAI/Google/Anthropic/...)
    │
    ├──► Tool Policy Pipeline (src/agents/tool-policy-pipeline.ts)
    │         │
    │         ▼
    │    Tool Execution (pi-tools.ts → 实际工具)
    │
    ├──► Streaming Subscribe (src/agents/pi-embedded-subscribe.ts)
    │         │
    │         ▼
    │    Block Reply Delivery
    │
    └──► Subagent Spawn (src/agents/tools/sessions-spawn-tool.ts)
              │
              ▼
         Subagent Registry (src/agents/subagent-registry.ts)
```

---

## 2. 智能体执行主链

### 2.1 执行入口：`runAgentTurnWithFallback`

**文件**：`src/auto-reply/reply/agent-runner-execution.ts`

这是自动回复 Agent 的顶层执行函数，负责整个 Agent Turn 的生命周期管理。

```typescript
export async function runAgentTurnWithFallback(params: {
  ctx: AgentContext;
  followupRun: FollowupRun;
  modelOverride?: { provider: string; model: string };
  ... callbacks (onPartialReply, onBlockReply, onAssistantMessageStart, onReasoningStream, onToolResult)
}): Promise<AgentRunLoopResult>
```

**核心职责分解**：

1. **Model Fallback 循环包装**
   - 首先调用 `runWithModelFallback()` 尝试配置的模型
   - 如果失败，自动切换到备选模型
   - 这是一个 **while 循环**：尝试主模型 → 失败 → 尝试 fallback1 → 失败 → 尝试 fallback2 → 直到全部失败

2. **CLI vs Embedded 路由**
   - 根据 provider 类型分叉：
     - CLI Provider → `runCliAgent()`（本地 CLI 执行）
     - 远程 Provider → `runEmbeddedPiAgent()`（远程/流式执行）

3. **流式回调分发**
   - `onPartialReply`: 处理打字信号和部分文本
   - `onBlockReply`: 通过 `createBlockReplyDeliveryHandler` 投递回复块
   - `onAssistantMessageStart`: 通知 UI 消息开始
   - `onReasoningStream`: 流式推送思考内容
   - `onToolResult`: 序列化工具结果（防止竞态）

4. **错误恢复**
   - **Context Overflow**: 调用 `resetSessionAfterCompactionFailure()` 决定是否重置 session
   - **Role Ordering 冲突**: 重置 session
   - **Gemini Session 损坏**: 删除 transcript，重置 session store
   - **Transient HTTP 错误 (502/521)**: 等待 2.5 秒后重试

### 2.2 嵌入式执行：`runEmbeddedPiAgent`

**文件**：`src/agents/pi-embedded-runner/run.ts`

这是嵌入式 PI Agent 的执行引擎，负责初始化 Agent 上下文、创建工具集、运行主循环。

```typescript
export async function runEmbeddedPiAgent(params: {
  ctx: AgentContext;
  tools: AnyAgentTool[];
  prompt: AgentPrompt;
  sessionKey: string;
  model: { provider: string; model: string };
  runtime: "pi" | "pi-mini";
  streamingCallbacks: StreamingCallbacks;
  signal?: AbortSignal;
}): Promise<EmbeddedPiRunResult>
```

**执行流程**：

```
1. 解析运行时参数（model, provider, sessionKey）
2. 创建 pi-agent 实例
3. 注册流式回调（subscribeEmbeddedPiSession）
4. 执行 runAgentTurn()（pi-agent 内部）
5. 等待流式完成
6. 返回结果
```

**关键设计**：流式回调通过 `subscribeEmbeddedPiSession` 注册，返回一个包含 `assistantTexts`、`toolMetas`、和 `unsubscribe()` 的对象。

### 2.3 单次尝试执行：`runEmbeddedAttempt`

**文件**：`src/agents/pi-embedded-runner/run/attempt.ts`

处理单个 AI 模型调用尝试，是最小执行单元。

```typescript
export async function runEmbeddedAttempt(params: {
  // Agent context, prompt, tools, model config, abort signal
}): Promise<AttemptResult>
```

**核心职责**：
- 调用 AI Provider API
- 处理原始响应（可能是流式或非流式）
- 将响应转换为统一格式
- 错误分类（超时、限流、上下文溢出等）

---

## 3. 工具与安全策略

### 3.1 工具工厂：`createOpenClawCodingTools`

**文件**：`src/agents/pi-tools.ts`

这是创建完整工具集的核心工厂函数。

```typescript
export function createOpenClawCodingTools(options?: {
  agentId?: string;
  exec?: ExecToolDefaults & ProcessToolDefaults;
  modelProvider?: string;
  modelId?: string;
  sandbox?: SandboxContext | null;
  sessionKey?: string;
  // 30+ 其他选项
}): AnyAgentTool[]
```

**工具创建流水线**（按顺序）：

```
1. 解析工具策略
   ↓
2. 创建沙箱读写工具（基于 sandbox 配置）
   ↓
3. 创建 execTool 和 processTool（安全配置已解析）
   ↓
4. 有条件创建 applyPatchTool（仅 OpenAI provider 且启用时）
   ↓
5. 添加通道代理工具（listChannelAgentTools）
   ↓
6. 添加 OpenClaw 工具（createOpenClawTools）
   ↓
7. 应用消息 provider 过滤
   （例如：voice provider 拒绝 tts 工具）
   ↓
8. 应用模型 provider 过滤
   （例如：xAI provider 拒绝 web_search 工具）
   ↓
9. 应用 OwnerOnlyToolPolicy（基于发送者是否为 owner）
   ↓
10. 应用完整工具策略管道（applyToolPolicyPipeline）
    ↓
11. 规范化工具 JSON Schema
    （Gemini 剥离约束；Anthropic 保留）
    ↓
12. 包装 BeforeToolCall Hook + AbortSignal
```

**关键洞察**：工具创建是一个 **多阶段过滤管道**，而不是简单的列表返回。每个阶段都有机会添加、删除或修改可用工具。

### 3.2 工具策略管道：`applyToolPolicyPipeline`

**文件**：`src/agents/tool-policy-pipeline.ts`

理解工具策略的核心理念：**先聚合，后过滤**。

```typescript
// 策略管道步骤构建
function buildDefaultToolPolicyPipelineSteps(params) {
  return [
    { policy: profilePolicy, label: "profile" },
    { policy: globalPolicy, label: "global" },
    { policy: agentPolicy, label: "agent" },
    { policy: groupPolicy, label: "group" },
  ];
}
```

**为什么"先聚合后过滤"？**

因为不同层级的策略可能有不同的要求：
- **Profile 级别**：用户的全局工具偏好
- **Provider 级别**：某些模型不支持某些工具（如 xAI 不支持 web_search）
- **Agent 级别**：特定 Agent 可能有特殊需求
- **Group 级别**：团队/组织可能有合规要求

管道执行逻辑：

```typescript
// 伪代码
for (const step of pipelineSteps) {
  // 1. 如果需要，剥离插件专属的 allowlist
  // 2. 使用插件组扩展策略（如 "plugin:github" → 所有 GitHub 插件工具）
  // 3. 过滤工具
  // 4. 对未知条目发出警告（区分 gated core 工具 vs 插件专属工具）
}
```

**警告机制**：当配置中引用了不存在的工具时，不会报错，而是输出警告说明该工具不可用的原因（是 core 工具被禁用，还是需要启用插件）。

### 3.3 策略来源的优先级

```
高优先级（后生效）
  └── agentPolicy（特定 Agent 覆盖）
  └── groupPolicy（组级别策略）
  └── profilePolicy（用户配置）
低优先级（先生效）
  └── globalPolicy（全局默认值）
```

**实际执行顺序**是反向的：global → profile → agent → group，每层都基于上层的输出继续过滤。

---

## 4. 并发与会话隔离

### 4.1 命令队列：`command-queue.ts`

**文件**：`src/process/command-queue.ts`

这是进程内命令队列，实现**基于 Lane 的并发序列化**。

**核心概念：Lane（通道）**

```
CommandLane.Main     → 主工作队列（默认）
CommandLane.Cron    → 定时任务专用
CommandLane.Subagent → 子智能体专用
CommandLane.Nested  → 嵌套执行
CommandLane.<session:xxx> → 会话级别隔离
```

**为什么需要 Lane 模型？**

考虑这些场景：
1. 用户在 Telegram 连续发了两条消息 → 需要串行处理，否则上下文混乱
2. Cron 定时任务正在运行 → 不应该阻塞主消息处理
3. 子智能体在执行 → 父 Agent 可能需要同时处理其他请求

**Lane 并发控制**：

```typescript
type LaneState = {
  lane: string;
  queue: QueueEntry[];
  activeTaskIds: Set<number>;    // 当前执行中的任务
  maxConcurrent: number;         // 最大并发数
  draining: boolean;             // 正在关闭
  generation: number;            // 重置计数器，使旧任务失效
};
```

**关键机制：Generation 隔离**

```typescript
// 当 SIGUSR1 触发进程内重启时
function resetAllLanes() {
  for (const lane of lanes.values()) {
    lane.generation++;  // 增加代数
    lane.activeTaskIds.clear();  // 清除活动任务
    // 保留队列中的任务（用户的工作）
  }
}

// 任务完成时检查
function onTaskComplete(entry, lane) {
  if (entry.generation !== lane.generation) {
    return; // 忽略陈旧完成通知
  }
}
```

这是非常巧妙的设计：当需要重启时，增加 generation 使得所有正在执行的任务完成回调都变成"无效"，避免处理已重置状态下的完成事件。

### 4.2 Session Lane 解析：`lanes.ts`

**文件**：`src/agents/pi-embedded-runner/lanes.ts`

```typescript
function resolveSessionLane(key: string): string {
  // 标准化 session key → lane 标识符
  // 格式：session:<sessionKey>
}

function resolveGlobalLane(lane?: string): string {
  // 特殊处理：Cron → Nested（避免死锁）
  // 因为 Cron 任务持有 Cron lane，如果另一个 Cron 等待它会死锁
}
```

**为什么要避免 Cron 死锁？**

假设：
1. Cron Job A 在 Cron lane 执行
2. 它需要等待某个资源，该资源被 Cron Job B 持有
3. Cron Job B 也在 Cron lane 等待

这就会形成死锁。通过将 Cron 任务的等待操作放到 `Nested` lane，避免了同 lane 内的潜在死锁。

### 4.3 活跃运行追踪：`runs.ts`

**文件**：`src/agents/pi-embedded-runner/runs.ts`

全局单例追踪所有活跃的嵌入式 Agent 运行。

```typescript
const embeddedRunState = resolveGlobalSingleton(
  Symbol.for("openclaw.embeddedRunState"),
  () => ({
    activeRuns: new Map<string, EmbeddedPiQueueHandle>(),
    snapshots: new Map<string, ActiveEmbeddedRunSnapshot>(),
    waiters: new Map<string, Set<EmbeddedRunWaiter>>(),
  })
);
```

**为什么要全局单例？**

因为 Gateway 的代码可能被编译打包到多个 chunk 中运行，使用 `Symbol.for()` 确保所有 chunk 共享同一个状态对象。

**核心能力**：

1. **消息排队**：`queueEmbeddedPiMessage()` - 向正在运行的流发送消息
2. **中止运行**：`abortEmbeddedPiRun()` - 中止单个或所有运行
3. **状态检查**：`isEmbeddedPiRunStreaming()` - 查询是否正在流式输出
4. **等待结束**：`waitForEmbeddedPiRunEnd()` - 等待运行完成（用于 graceful shutdown）
5. **快照存储**：`updateActiveEmbeddedRunSnapshot()` - 存储运行快照用于调试

---

## 5. 流式回复与事件

### 5.1 订阅处理：`subscribeEmbeddedPiSession`

**文件**：`src/agents/pi-embedded-subscribe.ts`

这是流式响应的核心状态机，处理所有流式事件。

```typescript
export function subscribeEmbeddedPiSession(params: {
  onPartialReply?: (text: string, typingHint?: number) => void;
  onBlockReply?: (block: ReplyPayload_Block) => void;
  onAssistantMessageStart?: () => void;
  onReasoningStream?: (text: string) => void;
  onToolResult?: (result: ToolResult) => void;
  // ... 更多回调
}): {
  assistantTexts: string[];
  toolMetas: ToolMeta[];
  unsubscribe: () => void;
  isCompacting: () => boolean;
  // ...
}
```

**内部状态机管理的关键内容**：

1. **Block Tag 解析**
   - 识别 `<think>`（思考块）和 `<final>`（最终回复块）
   - 跨 chunk 边界有状态地解析
   - 提取 `<final>` 块中的内容（当 `enforceFinalTag` 启用时）

2. **Block Reply Break 检测**
   - `"text_end"` - 文本回复结束
   - `"message_end"` - 完整消息结束

3. **重复消息检测**
   - 通过消息工具发送的消息可能被重复投递
   - `didSendViaMessagingTool()` 检测并抑制重复

4. **Compaction 协调**
   - Compaction（上下文压缩）是 Agent 运行时的重要操作
   - `isCompacting()` / `waitForCompactionRetry()` 管理压缩状态
   - 使用引用计数管理多个并发的 compaction 请求

### 5.2 负载处理：`payloads.ts`

**文件**：`src/agents/pi-embedded-runner/run/payloads.ts`

负责构建和管理 Agent 的输入输出负载。

**关键类型**：

```typescript
// Agent 提示结构
type AgentPrompt = {
  system: string;           // 系统提示
  context: AgentPromptEntry[];  // 上下文条目（消息、文件等）
  tools: AnyAgentTool[];    // 可用工具
  toolCallLimit?: number;   // 最大工具调用数
};

// 回复负载
type ReplyPayload_Block = {
  type: "text" | "image" | "tool_use" | "tool_result" | "error";
  content: string | object;
  // ...
};
```

---

## 6. 子智能体编排

### 6.1 Spawn 工具：`sessions-spawn-tool.ts`

**文件**：`src/agents/tools/sessions-spawn-tool.ts`

Agent 通过调用 `sessions_spawn` 工具来创建子 Agent 或 ACP 会话。

```typescript
const SessionsSpawnToolSchema = Type.Object({
  task: Type.String(),                    // 任务描述
  label: Type.Optional(Type.String()),    // 可读标签
  runtime: optionalStringEnum(["subagent", "acp"]),  // 运行类型
  agentId: Type.Optional(Type.String()), // 指定 Agent ID
  model: Type.Optional(Type.String()),   // 模型覆盖
  thinking: Type.Optional(Type.String()), // thinking 级别
  runTimeoutSeconds: Type.Optional(Type.Number()), // 超时设置
  mode: optionalStringEnum(["run", "session"]),  // 单次 vs 持续
  cleanup: optionalStringEnum(["delete", "keep"]), // 清理策略
  sandbox: optionalStringEnum(["inherit", "require"]), // 沙箱策略
  // ...
});
```

**两种运行时模式**：

1. **`runtime="acp"`（ACP 会话）**
   - 更重量级的会话抽象
   - 支持 `streamTo="parent"`（流式传输回父会话）
   - 支持 `resumeSessionId`（重放历史对话）

2. **`runtime="subagent"`（子 Agent）**
   - 默认模式
   - 更轻量
   - 支持 workspace 继承
   - 支持附件挂载

**为什么 subagent 不能继续 spawn？**

这是架构约束：**subagent 是 leaf node**。如果允许 subagent 继续 spawn，会形成无限递归的树结构，导致：
- 资源耗尽（每个 subagent 消耗内存和计算）
- 难以追踪的父-子关系
- 复杂的生命周期管理

ACP 会话作为更重量级的抽象，支持更复杂的场景包括 `streamTo`。

### 6.2 子 Agent 注册表：`subagent-registry.ts`

**文件**：`src/agents/subagent-registry.ts`

中央注册表追踪所有子 Agent 运行的生命周期。

```typescript
type SubagentRunRecord = {
  runId: string;
  childSessionKey: string;        // 子会话
  requesterSessionKey: string;    // 父会话
  requesterOrigin?: DeliveryContext;
  spawnMode: "run" | "session";
  outcome?: SubagentRunOutcome;   // success | failure | error
  endedReason?: SubagentLifecycleEndedReason;
  cleanupHandled?: boolean;
  // ...
};
```

**生命周期流程**：

```
registerSubagentRun()
    ↓
[子 Agent 运行中]
    ↓
markSubagentRunTerminated() ← 任何终端状态（成功/失败/错误）
    ↓
[15秒优雅期] ← 允许瞬时错误恢复
    ↓
completeSubagentRun()
    ↓
[通知父会话]
    ↓
[清理资源]
```

**公告机制（Announcement）**：

当子 Agent 结束时，需要通知父会话。但父会话可能在处理其他事情，所以公告机制需要：
- 重试策略（指数退避：1s → 2s → 4s → 8s，最多 3 次）
- 最大公告年龄限制（完成 30 分钟内，非完成 5 分钟内）
- 抑制某些类型（如 `steer-restart`）

**孤儿检测**：

如果子 Agent 的 session 记录丢失（磁盘损坏、重启等），会被标记为 orphan：
- 原因：`missing-session-entry`、`missing-session-id`
- 在 restore 和 resume 阶段进行清理

---

## 7. 技能系统

### 7.1 工作区技能加载：`workspace.ts`

**文件**：`src/agents/skills/workspace.ts`

技能（Skills）是可注入 Agent 提示的外部知识/指令单元。

**技能来源优先级**（从低到高）：

```
1. extraDirs        ← 配置指定的额外目录
2. bundledSkillsDir ← OpenClaw 绑定的技能（~/.openclaw/skills 等）
3. managedSkillsDir ← 用户管理的技能
4. agents-skills-personal ← 个人技能（~/.agents/skills）
5. agents-skills-project  ← 项目技能（<workspace>/.agents/skills）
6. workspaceSkillsDir     ← 工作区技能（<workspace>/skills）最高优先级
```

**加载约束**：

- 单个技能文件最大：`maxSkillFileBytes = 256KB`
- 每个来源最多加载：`maxSkillsLoadedPerSource = 200`
- 路径必须位于允许的目录内（防止符号链接逃逸）

**提示注入限制**：

```typescript
// 应用提示限制
function applySkillsPromptLimits(skills, config) {
  const maxSkillsInPrompt = 150;
  const maxSkillsPromptChars = 30_000;

  // 二分查找找到最大的前缀
  // 使得总字符数不超过限制
}
```

### 7.2 技能刷新：`refresh.ts`

**文件**：`src/agents/skills/refresh.ts`

使用 `chokidar` 监控技能文件变化，触发快照版本更新。

```typescript
// 版本更新逻辑
function bumpVersion(current: number): number {
  const now = Date.now();
  return now <= current ? current + 1 : now;  // 保证单调递增
}
```

**为什么用时间戳而不是简单递增？**

因为 `Date.now()` 在短时间内可能返回相同的值（如高频更新），所以用 `now <= current ? current + 1 : now` 保证即使时间戳相同也能递增。

**监控优化**：
- 只监控 `SKILL.md` 文件，不监控整个目录树
- 忽略：`.git`、`node_modules`、`dist`、`.venv`、`__pycache__` 等
- 使用 `awaitWriteFinish` 等待写入完成 + `debounceMs` 防抖

### 7.3 环境变量覆盖：`env-overrides.ts`

**文件**：`src/agents/skills/env-overrides.ts`

技能可以声明 `env` 覆盖，在执行时注入环境变量。

**参考计数机制**：

```typescript
type ActiveSkillEnvEntry = {
  baseline: string | undefined;  // 注入前的原始值
  value: string;                  // 当前注入的值
  count: number;                  // 引用计数（嵌套调用）
};

// 示例
acquireActiveSkillEnvKey("OPENAI_API_KEY", "sk-xxx"); // count=1
acquireActiveSkillEnvKey("OPENAI_API_KEY", "sk-yyy"); // count=2（不覆盖，因为已存在）
releaseActiveSkillEnvKey("OPENAI_API_KEY");           // count=1
releaseActiveSkillEnvKey("OPENAI_API_KEY");           // count=0，清理
```

**为什么需要引用计数？**

因为技能可能嵌套调用：
```
技能 A 启动（注入 VAR=123）
  → 调用技能 B（也需要 VAR=123）
  → 技能 B 返回
  → 技能 A 返回
```

如果不引用计数，技能 B 返回时会删除 `VAR`，导致技能 A 继续执行时环境变量丢失。

**安全防护**：
- 危险主机变量（如 `OPENSSL_CONF`）被阻止
- 敏感变量需要显式白名单
- 验证值中不能有 null 字节或可疑模式

---

## 8. 失败恢复

### 8.1 模型回退：`model-fallback.ts`

**文件**：`src/agents/model-fallback.ts`

当主模型失败时，自动尝试配置的备选模型。

**核心类型**：

```typescript
type ModelFallbackRunOptions = {
  allowTransientCooldownProbe?: boolean;
};

type FallbackAttempt = {
  provider: string;
  model: string;
  error?: Error;
  failedAt?: number;
};
```

**回退链解析顺序**：

```
主模型
  ↓
配置的 fallback1
  ↓
配置的 fallback2
  ↓
默认提供者列表中的模型
```

**Cooldown 决策逻辑**：

```typescript
function resolveCooldownDecision(params) {
  // 持久性认证问题：始终跳过
  if (reason === "auth" || reason === "auth_permanent") {
    return "skip";
  }

  // 计费问题：单提供者环境探测；否则跳过
  if (reason === "billing") {
    return singleProvider ? "probe" : "skip";
  }

  // 瞬时问题（限流、过载）：尽管 cooldown 也尝试
  if (reason === "rate_limit" || reason === "overloaded") {
    return "attempt";
  }
}
```

**探测机制（Probe）**：

当模型处于 cooldown 时，不是一直等到期满，而是：

1. **探测间隔**：`MIN_PROBE_INTERVAL_MS = 30s`
2. **探测时机**：cooldown 到期前 2 分钟内（`PROBE_MARGIN_MS`）
3. **探测状态 TTL**：`PROBE_STATE_TTL_MS = 24h`（防止永久探测）
4. **LRU 驱逐**：最多 256 个探测 key

```
不探测：cooldown 剩余时间 > 2分钟
探测：cooldown 剩余时间 < 2分钟，且距离上次探测 > 30秒
```

### 8.2 嵌入式辅助函数：`pi-embedded-helpers.ts`

**文件**：`src/agents/pi-embedded-helpers.ts`

这是一个聚合导出文件，重新导出多个辅助模块：

**错误分类**（`errors.js`）：
- `isBillingErrorMessage()` / `isBillingAssistantError()`
- `isContextOverflowError()` / `isLikelyContextOverflowError()`
- `isCompactionFailureError()`
- `isRateLimitErrorMessage()` / `isTransientHttpError()`
- `classifyFailoverReason()` → 分类为 `billing` | `auth` | `rate_limit` | `context_overflow` | `unknown`

**Google 特殊处理**（`google.js`）：
- `sanitizeGoogleTurnOrdering()` - 修复 Google 模型特有的轮次顺序问题

**OpenAI 降级**（`openai.js`）：
- `downgradeOpenAIReasoningBlocks()` - 移除 reasoning blocks（某些模型不支持）
- `downgradeOpenAIFunctionCallReasoningPairs()` - 处理 function call + reasoning 组合

**消息去重**（`messaging-dedupe.js`）：
- `isMessagingToolDuplicate()` - 检测通过消息工具发送的重复回复

**Turn 验证**（`turns.js`）：
- `mergeConsecutiveUserTurns()` - 合并连续的用户消息
- `validateAnthropicTurns()` / `validateGeminiTurns()` - 验证消息结构

---

## 9. Gateway 控制平面

### 9.1 服务器启动：`startGatewayServer`

**文件**：`src/gateway/server.impl.ts`

Gateway 的主入口函数，协调所有子系统的启动。

```typescript
export async function startGatewayServer(
  port = 18789,
  opts: GatewayServerOptions = {},
): Promise<GatewayServer>
```

**启动序列**：

```
1. Config 预检
   ├── 验证 legacy config 迁移
   ├── 应用插件自动启用
   └── 解析 secrets
       ↓
2. Auth 引导
   └── ensureGatewayStartupAuth() ← 生成/存储 token
       ↓
3. 运行时 Config 解析
   └── resolveGatewayRuntimeConfig() ← bind host, auth mode, tailscale
       ↓
4. 插件加载
   └── loadGatewayPlugins() → pluginRegistry
       ↓
5. 运行时状态创建
   ├── createGatewayRuntimeState()
   │   ├── HTTP Server
   │   ├── WebSocket Server
   │   ├── Client Sets
   │   └── Broadcast 函数
   ├── new NodeRegistry() ← 追踪连接的节点客户端
   └── buildGatewayCronService() ← 定时任务服务
       ↓
6. 通道启动
   └── startChannel() for each channel
       ↓
7. 发现服务
   ├── startGatewayDiscovery() ← mDNS/Bonjour
   └── startGatewayTailscaleExposure() ← Tailscale serve/funnel
       ↓
8. Config 重载器
   └── startGatewayConfigReloader() + createGatewayReloadHandlers()
       ↓
9. 返回 { close } 句柄
```

### 9.2 WebSocket 连接处理

**文件**：`src/gateway/server/ws-connection.ts`

处理 WebSocket 连接事件的第一层。

**握手挑战机制**：

```typescript
// 连接时立即发送 challenge
socket.send(JSON.stringify({
  type: "connect.challenge",
  nonce: generateNonce(),  // 随机数
}));
```

**为什么需要 challenge？**

这用于**重放攻击防护**：
1. 服务器生成随机 nonce
2. 客户端必须在响应中包含用 device key 签名的 nonce
3. 如果攻击者试图重放旧连接，nonce 不匹配

### 9.3 WebSocket 消息路由

**文件**：`src/gateway/server/ws-connection/message-handler.ts`

核心消息处理函数。

**连接握手流程**：

```
1. 接收 connect 消息
   ├── 验证协议版本范围（min ≤ VERSION ≤ max）
   ├── 验证设备配对 token（如有 device.id）
   ├── 解析客户端角色（node/operator/webchat/cli）
   └── 解析授权 scopes
       ↓
2. 发送 hello-ok
   ├── serverVersion
   ├── connId
   ├── snapshot
   ├── policyLimits
   └── authInfo
       ↓
3. 进入请求/事件处理循环
```

**Scope 权限模型**：

```
operator.read   → 读取配置、状态
operator.write  → 修改配置、发送消息
operator.admin  → 管理操作（关闭、重启）
operator.pairing → 设备配对
operator.approvals → 执行审批
```

### 9.4 请求授权：`authorizeGatewayMethod`

**文件**：`src/gateway/server-methods.ts`

```typescript
function authorizeGatewayMethod(
  method: string,
  client: GatewayRequestOptions["client"]
): ErrorShape | null  // null = 授权成功
```

**授权决策树**：

```
health 方法 → 始终允许
node 角色 → 始终允许
operator.admin scope → 始终允许
否则 → 检查 operator scopes 是否覆盖该方法
```

### 9.5 广播系统：`createGatewayBroadcaster`

**文件**：`src/gateway/server-broadcast.ts`

向连接的客户端发送事件的机制。

```typescript
function createGatewayBroadcaster(params: {
  clients: Set<GatewayWsClient>;
}) {
  return {
    broadcast(event: string, payload: unknown),
    broadcastToConnIds(connIds: string[], event: string, payload: unknown),
  };
}
```

**慢消费者处理**：

```typescript
if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
  if (dropIfSlow) {
    return; // 跳过这个客户端
  } else {
    socket.close(1008, "slow consumer"); // 关闭连接
  }
}
```

**Scope 守卫**：某些事件需要特定 scope 才能接收，如 `exec.approval.requested` 需要 `operator.approvals`。

### 9.6 节点注册表：`NodeRegistry`

**文件**：`src/gateway/node-registry.ts`

追踪连接到 Gateway 的节点客户端。

```typescript
class NodeRegistry {
  register(client: GatewayWsClient, opts): NodeSession
  unregister(connId: string): string | null
  listConnected(): NodeSession[]
  get(nodeId: string): NodeSession | undefined

  // RPC 风格的 invoke/response
  async invoke(params: {
    nodeId: string;
    command: string;
    params?: unknown;
    timeoutMs?: number;
    idempotencyKey?: string;
  }): Promise<NodeInvokeResult>

  handleInvokeResult(params: {
    id: string;
    nodeId: string;
    ok: boolean;
    payload?: unknown;
    error?: ErrorShape;
  }): boolean
}
```

**invoke 机制**：

```
Gateway                         Node
   │                              │
   │──── node.invoke.request ────►│
   │     { requestId, command }    │
   │                              │
   │◄─── node.invoke.response ────│
   │     { requestId, ok, payload }│
```

通过 `requestId` 匹配请求和响应，使用 Promise 实现超时控制。

---

## 10. Gateway HTTP 与生命周期

### 10.1 HTTP 服务器：`createGatewayHttpServer`

**文件**：`src/gateway/server-http.ts`

创建 HTTP 服务器，定义多阶段请求处理管道。

```typescript
function createGatewayHttpServer(opts: {
  // ...选项
}): {
  server: HttpServer;
  attachUpgradeHandler: () => void;
  createHooksRequestHandler: () => RequestHandler;
  handleToolsInvokeHttpRequest: RequestHandler;
}
```

**请求处理阶段**（按顺序）：

```
1. hooks        → /hooks/* 端点
2. tools-invoke → /tools/invoke
3. slack        → Slack webhook
4. openresponses → OpenResponses API
5. openai       → OpenAI 兼容 API
6. canvas-auth  → Canvas 认证
7. a2ui         → A2UI 端点
8. canvas-http  → Canvas HTTP
9. plugin routes → 插件路由
10. control-ui  → 控制面板 UI
11. gateway-probes → 健康检查
```

每阶段返回 `true` 表示请求已被处理，停止后续阶段。

### 10.2 OpenAI 兼容端点：`handleOpenAiHttpRequest`

**文件**：`src/gateway/openai-http.ts`

实现 `/v1/chat/completions` 端点。

**请求流程**：

```
1. 验证请求体（大小、认证、限流）
2. 解析消息格式 → asMessages()
3. 提取图片 → resolveImagesForRequest()
4. 构建 Agent Prompt → buildAgentPrompt()
5. 解析 Session Key → resolveGatewayRequestContext()
6. 执行 Agent（流式或非流式）
7. 返回响应
```

**流式响应格式**（SSE）：

```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}

data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."}}]}

data: [DONE]
```

### 10.3 OpenResponses 端点：`handleOpenResponsesHttpRequest`

**文件**：`src/gateway/openresponses-http.ts`

实现 `/v1/responses` API。

**与 OpenAI 端点的关键差异**：

1. **Schema 验证**：使用 Zod（更严格）而非 JSON Schema
2. **输入类型**：支持 `input_file`（PDF 渲染为图片）
3. **工具选择**：支持 `tool_choice` 参数（`none`/`required`/`function`）
4. **指令**：支持 `instructions` 作为额外系统提示
5. **SSE 事件格式**：完全不同

```
response.created
response.in_progress
response.output_item.added
response.content_part.added
response.output_text.delta (多次)
response.output_text.done
response.completed
```

### 10.4 热重载系统

**文件**：`src/gateway/config-reload.ts` + `server-reload-handlers.ts`

**可热重载的配置**：
- Hooks 配置
- 心跳运行器配置
- Cron 并发设置
- 通道配置（部分）
- 命令 lane 并发数

**必须重启的配置**：
- 端口绑定
- 认证模式
- Tailscale 设置
- 插件列表
- 模型目录

**重启协调**：

```typescript
// 如果有活跃操作（队列大小、pending 回复、嵌入式运行）
if (hasActiveOperations()) {
  // 延迟重启，直到空闲
  deferGatewayRestartUntilIdle(timeoutMs);
} else {
  // 立即重启
  emitGatewayRestart();
}
```

### 10.5 关闭处理：`createGatewayCloseHandler`

**文件**：`src/gateway/server-close.ts`

Graceful shutdown 的核心。

**关闭序列**：

```
1. 停止发现服务（Bonjour、Tailscale）
2. 停止通道插件
3. 停止插件服务
4. 停止 Cron 和心跳
5. 停止 Gmail watcher
6. 广播 shutdown 事件给所有客户端
7. 清理所有定时器
8. 关闭 WebSocket 服务器
9. 关闭 HTTP 服务器
10. 释放插件路由注册表
```

---

## 11. 协议层

### 11.1 协议版本与验证

**文件**：`src/gateway/protocol/index.ts` + `schema/protocol-schemas.ts`

```typescript
export const PROTOCOL_VERSION = 3 as const;
```

**为什么需要协议版本？**

Gateway 和客户端可能来自不同版本，需要：
1. **前向兼容**：新客户端连接旧 Gateway
2. **后向兼容**：旧客户端连接新 Gateway
3. **版本协商**：握手时交换支持的版本范围

```typescript
// 连接参数
type ConnectParams = {
  protocolVersion: number;
  minProtocol: number;  // 客户端支持的最老版本
  maxProtocol: number;  // 客户端支持的最新版本
  // ...
};

// 握手时检查
if (VERSION < minProtocol || VERSION > maxProtocol) {
  // 版本不兼容，关闭连接
}
```

### 11.2 帧结构

**文件**：`src/gateway/protocol/schema/frames.ts`

```typescript
// 请求帧
type RequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

// 响应帧
type ResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: ErrorShape;
};

// 事件帧
type EventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;         // 全局序列号
  stateVersion?: number;
};
```

### 11.3 Schema 校验

**为什么 Gateway 在业务 handler 前要做 schema 校验？**

1. **防御性编程**：在处理数据前验证结构
2. **清晰的错误消息**：校验失败返回明确的错误码
3. **安全边界**：防止恶意/畸形数据进入业务逻辑
4. **文档化接口**：Schema 本身就是接口文档

```typescript
// 编译后的校验器
export const validateConnectParams = ajv.compile<ConnectParams>(ConnectParamsSchema);
export const validateRequestFrame = ajv.compile<RequestFrame>(RequestFrameSchema);
// ... 60+ 更多验证器
```

---

## 12. 系统胶水层

### 12.1 运行时配置解析

**文件**：`src/gateway/server-runtime-config.ts`

`resolveGatewayRuntimeConfig()` 验证和解析所有运行时配置。

**关键验证**：

- `bind=loopback` → 必须解析为 loopback 地址
- `bind=custom` → 需要有效的 IPv4
- Tailscale funnel → 需要 `auth.mode=password`
- 非 loopback 绑定 → 需要认证 token 或 `trusted-proxy` 模式

### 12.2 Tailscale 暴露

**文件**：`src/gateway/server-tailscale.ts`

```typescript
type TailscaleMode = "off" | "serve" | "funnel";
```

- `serve`：通过 Tailscale HTTPS 代理访问
- `funnel`：公开到互联网（更激进）

### 12.3 发现服务

**文件**：`src/gateway/server-discovery-runtime.ts`

```typescript
type DiscoveryConfig = {
  mdnsMode: "off" | "minimal" | "full";
  wideAreaDiscoveryEnabled: boolean;
  wideAreaDiscoveryDomain?: string;
};
```

- **mDNS/Bonjour**：局域网发现
- **DNS-SD**：广域网发现（写入 zone 文件）

### 12.4 Lane 并发配置

**文件**：`src/gateway/server-lanes.ts`

```typescript
applyGatewayLaneConcurrency(cfg);

// 设置
CommandLane.Cron     → cfg.cron?.maxConcurrentRuns ?? 1
CommandLane.Main     → resolveAgentMaxConcurrent(cfg)
CommandLane.Subagent → resolveSubagentMaxConcurrent(cfg)
```

### 12.5 会话 Key 解析

**文件**：`src/gateway/server-session-key.ts`

```typescript
resolveSessionKeyForRun(runId: string): string | undefined
```

**解析优先级**：
1. 内存：`getAgentRunContext(runId)?.sessionKey`（最快）
2. 缓存：`resolvedSessionKeyByRunId`（1s TTL）
3. 磁盘：从 session store 查找
4. 注册到 run context

### 12.6 内存后端初始化

**文件**：`src/gateway/server-startup-memory.ts`

为启用了 `memory.search` 的 Agent 初始化 QMD 内存搜索后端。

### 12.7 执行审批管理器

**文件**：`src/gateway/exec-approval-manager.ts`

```typescript
class ExecApprovalManager {
  create(request, timeoutMs): ExecApprovalRecord
  register(record, timeoutMs): Promise<ExecApprovalDecision | null>
  resolve(recordId, decision, resolvedBy?): boolean
  expire(recordId, resolvedBy?): boolean
  consumeAllowOnce(recordId): boolean  // 原子操作，防止重放
}
```

**为什么需要 Allow-Once 消耗？**

```typescript
// 用户点击"只允许一次"
decision = "allow-once"

// Agent 执行操作时
if (!manager.consumeAllowOnce(recordId)) {
  // 已经被消耗（重放攻击或重复调用）
  throw new Error("Approval already consumed");
}
```

---

## 13. 架构问答自测

### Q1: 为什么要"session lane + global lane"？

**答案**：

Session lane 确保同一会话的消息**串行处理**，避免上下文混乱。例如用户在 Telegram 连发三条消息，如果并行处理，Agent 可能看到乱序的消息序列。

Global lane（Main）处理所有不特定于某个会话的工作。

此外，Cron lane 被映射到 Nested lane，以**避免 Cron 死锁**：如果 Cron 任务等待同一个 Cron lane 上的资源，会形成死锁。

---

### Q2: 工具策略为何是"先聚合后过滤"？

**答案**：

工具策略来自多个层级：profile（用户）、provider（模型）、agent（特定 Agent）、group（组织）。每层策略可能包含不同的工具集合。

Pipeline 模式允许：
1. **累积**：global → profile → agent → group，每层添加/移除
2. **插件组扩展**：`"plugin:github"` 展开为所有 GitHub 插件工具
3. **警告而非错误**：引用不存在的工具时警告而非拒绝

---

### Q3: Compaction 与 Model Fallback 的先后关系？

**答案**：

**Compaction 先于 Model Fallback**。

执行顺序：
1. 模型调用
2. 上下文溢出错误 → 触发 compaction
3. Compaction 失败 → 检查是否应该重置 session
4. 只有在所有恢复手段都用尽后，才尝试 Model Fallback

Compaction 是**本会话内的恢复**，Fallback 是**跨模型的恢复**。

---

### Q4: 子智能体为什么不能继续 spawn？

**答案**：

Subagent 是**叶子节点**，这是架构约束。允许无限递归 spawn 会导致：
- 资源耗尽（内存、CPU）
- 父-子关系链难以追踪
- 生命周期管理复杂化

ACP 会话作为更重量级的抽象，才支持 `streamTo="parent"`（允许流式传回父会话）。

---

### Q5: 为什么 connect.challenge + device nonce 能降低重放风险？

**答案**：

**重放攻击**：攻击者记录合法连接，之后重放以冒充客户端。

**Challenge 机制**：
1. 服务器发送随机 nonce
2. 客户端必须用 device key 签名 nonce
3. 重放时 nonce 已过期/无效

这确保每次连接都有独特的、不可预测的挑战。

---

### Q6: operator.read/write/admin 和 pairing/approvals scope 的分工？

**答案**：

```
operator.read  → 读取操作（查看配置、状态、消息）
operator.write → 写入操作（修改配置、发送消息）
operator.admin → 管理操作（关闭、重启、破坏性操作）

operator.pairing   → 设备配对流程
operator.approvals → 执行审批流程
```

**关键分离**：`admin` 不隐含 `approvals`——即使有管理员权限，执行敏感操作（如 exec）仍需要单独的审批。

---

### Q7: openai-http 与 openresponses-http 在输入/流式协议上的差异？

**答案**：

**请求格式**：
- OpenAI：使用 JSON Schema 验证，`image_url` 格式
- OpenResponses：使用 Zod Schema 验证，`input_file` 支持 PDF

**流式事件**：
- OpenAI：`chat.completion.chunk` + delta content
- OpenResponses：`response.created` → `response.output_item.added` → `response.content_part.added` → `response.output_text.delta` → `response.completed`

**工具调用**：
- OpenAI：标准 function calling
- OpenResponses：`tool_choice` 参数支持 `none`/`required`/`function`

---

### Q8: 什么配置变化可以热重载，什么变化必须重启？

**答案**：

**可热重载**：
- Hooks 配置
- 心跳/Cron 参数
- 命令 lane 并发数
- 部分通道配置

**必须重启**：
- 端口绑定（`bind` 模式）
- 认证配置（`auth.mode`）
- Tailscale 设置
- 插件列表变更
- 模型目录更新

Gateway 使用 `diffConfigPaths()` 递归比较配置树，确定变更类型。

---

### Q9: 为什么 Gateway 在业务 handler 前要做 schema 校验？

**答案**：

1. **安全边界**：在不可信数据进入业务逻辑前建立防护
2. **故障快速失败**：校验失败立即返回明确错误，而非等到业务层才发现
3. **版本协商**：不同客户端可能发送不同格式，通过校验确保一致性
4. **文档价值**：Schema 本身就是接口规范

Protocol 层使用 AJV 编译验证器，性能高效（预编译而非每次运行时解析）。

---

## 附录：文件索引表

| 模块 | 文件路径 | 核心函数/类 |
|------|----------|-------------|
| **Agent 执行** | | |
| 自动回复执行 | `src/auto-reply/reply/agent-runner-execution.ts` | `runAgentTurnWithFallback` |
| 嵌入式运行器 | `src/agents/pi-embedded-runner/run.ts` | `runEmbeddedPiAgent` |
| 尝试执行 | `src/agents/pi-embedded-runner/run/attempt.ts` | `runEmbeddedAttempt` |
| **工具系统** | | |
| 工具工厂 | `src/agents/pi-tools.ts` | `createOpenClawCodingTools` |
| 策略管道 | `src/agents/tool-policy-pipeline.ts` | `applyToolPolicyPipeline` |
| **并发** | | |
| 命令队列 | `src/process/command-queue.ts` | `enqueueCommandInLane` |
| Lane 解析 | `src/agents/pi-embedded-runner/lanes.ts` | `resolveSessionLane` |
| 运行追踪 | `src/agents/pi-embedded-runner/runs.ts` | `setActiveEmbeddedRun` |
| **流式** | | |
| 订阅处理 | `src/agents/pi-embedded-subscribe.ts` | `subscribeEmbeddedPiSession` |
| **子 Agent** | | |
| Spawn 工具 | `src/agents/tools/sessions-spawn-tool.ts` | `createSessionsSpawnTool` |
| 注册表 | `src/agents/subagent-registry.ts` | `registerSubagentRun` |
| **技能** | | |
| 工作区 | `src/agents/skills/workspace.ts` | `loadSkillEntries` |
| 刷新 | `src/agents/skills/refresh.ts` | `bumpSkillsSnapshotVersion` |
| 环境覆盖 | `src/agents/skills/env-overrides.ts` | `applySkillEnvOverrides` |
| **失败恢复** | | |
| 模型回退 | `src/agents/model-fallback.ts` | `runWithModelFallback` |
| **Gateway** | | |
| 服务器入口 | `src/gateway/server.impl.ts` | `startGatewayServer` |
| WebSocket 连接 | `src/gateway/server/ws-connection.ts` | `attachGatewayWsConnectionHandler` |
| WebSocket 消息 | `src/gateway/server/ws-connection/message-handler.ts` | `attachGatewayWsMessageHandler` |
| 请求方法 | `src/gateway/server-methods.ts` | `handleGatewayRequest` |
| 广播 | `src/gateway/server-broadcast.ts` | `createGatewayBroadcaster` |
| 节点注册表 | `src/gateway/node-registry.ts` | `NodeRegistry` |
| HTTP 服务器 | `src/gateway/server-http.ts` | `createGatewayHttpServer` |
| OpenAI HTTP | `src/gateway/openai-http.ts` | `handleOpenAiHttpRequest` |
| OpenResponses HTTP | `src/gateway/openresponses-http.ts` | `handleOpenResponsesHttpRequest` |
| 配置重载 | `src/gateway/config-reload.ts` | `startGatewayConfigReloader` |
| 重载处理器 | `src/gateway/server-reload-handlers.ts` | `createGatewayReloadHandlers` |
| 关闭处理 | `src/gateway/server-close.ts` | `createGatewayCloseHandler` |
| 运行时配置 | `src/gateway/server-runtime-config.ts` | `resolveGatewayRuntimeConfig` |
| Tailscale | `src/gateway/server-tailscale.ts` | `startGatewayTailscaleExposure` |
| 发现服务 | `src/gateway/server-discovery-runtime.ts` | `startGatewayDiscovery` |
| Lane 配置 | `src/gateway/server-lanes.ts` | `applyGatewayLaneConcurrency` |
| 模型目录 | `src/gateway/server-model-catalog.ts` | `loadGatewayModelCatalog` |
| 会话 Key | `src/gateway/server-session-key.ts` | `resolveSessionKeyForRun` |
| 内存后端 | `src/gateway/server-startup-memory.ts` | `startGatewayMemoryBackend` |
| 执行审批 | `src/gateway/exec-approval-manager.ts` | `ExecApprovalManager` |
| **协议** | | |
| 协议验证 | `src/gateway/protocol/index.ts` | `validateRequestFrame` |
| 帧 Schema | `src/gateway/protocol/schema/frames.ts` | `GatewayFrameSchema` |
| 协议 Schema | `src/gateway/protocol/schema/protocol-schemas.ts` | `ProtocolSchemas` |
