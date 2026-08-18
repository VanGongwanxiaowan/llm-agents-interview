# 04_Agent系统

## 1. 什么是 Agent？

**Agent（智能体）** 是 OpenClaw 中处理 AI 对话的核心单元：

```
用户消息 ──▶ Agent ──▶ AI 模型 ──▶ 回复
              │
              ├── 工具调用 (Tools)
              ├── 记忆管理 (Memory)
              └── 上下文处理 (Context)
```

**从代码角度理解**：

```typescript
// Agent 配置示例
{
  id: "my-agent",
  model: "claude-sonnet-4-20250514",
  provider: "anthropic",
  systemPrompt: "你是一个有用的助手",
  tools: ["bash", "read", "web_search"]
}
```

---

## 2. Agent 的核心组件

### 2.1 模型选择 (Model Selection)

```typescript
// src/agents/model-selection.ts
export async function resolveModelAsync(params: {
  agentId: string;
  sessionKey: string;
  // ...
}): Promise<ResolvedModel> {
  // 1. 从配置获取模型 ID
  // 2. 应用模型覆盖 (model overrides)
  // 3. 检查 fallback 策略
  // 4. 返回解析后的模型
}
```

**为什么需要模型选择？**
- 不同的 Agent 可能使用不同的模型
- 支持模型 fallback（主模型失败时切换到备用模型）
- 支持动态模型切换（根据负载或错误情况）

### 2.2 上下文窗口管理 (Context Window)

```typescript
// src/agents/context-runtime-state.ts
export const CONTEXT_WINDOW_RUNTIME_STATE = new ContextWindowRuntimeState();

// 管理每个模型的上下文窗口大小
// 超过限制时触发 compaction（压缩）
```

**Compaction（压缩）机制**：
- 当对话历史太长时，压缩旧消息以节省 token
- 保留关键信息（工具结果、重要决策）
- 删除冗余内容（重复解释、闲聊）

### 2.3 工具系统 (Tool System)

```typescript
// 可用工具类型
interface Tool {
  name: string;
  description: string;
  schema: JsonSchemaObject;
  handler: (params: any) => Promise<ToolResult>;
}

// 内置工具
- bash: 执行 shell 命令
- read: 读取文件
- write: 写入文件
- web_search: 搜索网页
- web_fetch: 获取网页内容
- 等等...
```

---

## 3. Agent 执行流程

### 3.1 消息处理流程

```
用户消息
    │
    ▼
┌─────────────────────────────────┐
│  1. 解析消息 (Parse)            │
│     - 提取文本/媒体/命令         │
│     - 构建 message context      │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  2. 注入 Hook (before_agent_start)│
│     - 插件可以修改 context       │
│     - 决定是否继续               │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  3. 构建提示 (Prompt Build)      │
│     - 组装 system prompt        │
│     - 注入历史消息               │
│     - 应用 prompt mutations     │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  4. LLM 调用 (Model Call)       │
│     - 选择 provider             │
│     - 处理 auth                 │
│     - 流式响应处理               │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  5. 工具调用 (Tool Call)        │
│     - 解析 tool calls          │
│     - 执行工具                  │
│     - 返回结果                  │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  6. 生成回复 (Generate Reply)   │
│     - 整合工具结果              │
│     - 生成最终回复              │
│     - 应用输出转换              │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  7. 注入 Hook (before_agent_reply)│
│     - 插件可以修改回复          │
│     - 添加跟踪/分析             │
└─────────────┬───────────────────┘
              │
              ▼
         回复用户
```

### 3.2 代码路径

```typescript
// 核心入口：pi-embedded-runner.ts
export async function runEmbeddedPiAgent(params: RunEmbeddedPiAgentParams): Promise<EmbeddedPiRunResult> {
  // 1. 解析和验证输入
  const parsed = parseMessage(params.prompt);

  // 2. 构建 system prompt
  const systemPrompt = buildSystemPrompt(params);

  // 3. 获取模型
  const model = await resolveModelAsync(params);

  // 4. 执行 agent 循环
  while (true) {
    // 4a. 调用 LLM
    const response = await model.call({
      system: systemPrompt,
      messages: conversationHistory,
    });

    // 4b. 处理工具调用
    if (response.toolCalls) {
      for (const toolCall of response.toolCalls) {
        const result = await executeTool(toolCall);
        conversationHistory.push(result);
      }
      continue;
    }

    // 4c. 生成回复
    return { payloads: [response.text] };
  }
}
```

---

## 4. Session（会话）管理

### 4.1 Session 结构

```typescript
// Session 定义
interface Session {
  id: string;              // 唯一标识
  agentId: string;         // 关联的 Agent
  messages: Message[];     // 对话历史
  createdAt: Date;
  updatedAt: Date;
  metadata: SessionMeta;   // 元数据（来源渠道、用户信息等）
}
```

### 4.2 会话路由

```typescript
// src/agents/command/session.ts
export function resolveSessionKeyForRequest(params: {
  channelId: string;
  userId: string;
  threadId?: string;
}): string {
  // 确保同一用户/线程的消息路由到同一个 session
  return `${channelId}:${userId}:${threadId ?? "default"}`;
}
```

### 4.3 会话持久化

```typescript
// Session 存储在文件系统
// ~/.openclaw/sessions/<session-id>/

// 每个 session 包含：
// - messages.jsonl     // 消息历史
// - state.json         // 状态信息
// - artifacts/         // 生成的文件
```

---

## 5. Tool 调用机制

### 5.1 工具发现

```typescript
// src/agents/tool-catalog.ts
export function resolveToolCatalog(agentId: string): ToolCatalog {
  // 1. 从 Agent 配置获取允许的工具列表
  // 2. 加载工具的 schema
  // 3. 返回完整工具目录
}
```

### 5.2 工具执行

```typescript
// 工具执行流程
async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const tool = findTool(toolCall.name);
  if (!tool) {
    return { error: `Unknown tool: ${toolCall.name}` };
  }

  // 注入 Hook (before_tool_call)
  const hookContext = buildHookContext(toolCall);
  await hookRunner.runBeforeToolCall(toolCall, hookContext);

  // 执行工具
  const result = await tool.handler(toolCall.params);

  // 注入 Hook (after_tool_call)
  await hookRunner.runAfterToolCall(result, hookContext);

  return result;
}
```

### 5.3 工具循环检测

```typescript
// src/agents/tool-loop-detection.ts
export function detectToolLoop(toolCalls: ToolCall[]): boolean {
  // 检测是否在重复调用同一工具
  // 超过阈值时中止执行
  // 防止 Agent 陷入死循环
}
```

---

## 6. 模型提供商 (Provider)

### 6.1 Provider 抽象

```typescript
// Provider 接口
interface Provider {
  id: string;
  call(model: string, params: CallParams): Promise<Response>;
  stream(model: string, params: CallParams): AsyncIterable<Response>;
}
```

### 6.2 内置 Provider

| Provider | 说明 | 配置文件 |
|----------|------|----------|
| anthropic | Claude 模型 | providers.anthropic |
| openai | GPT 系列 | providers.openai |
| openrouter | 第三方模型聚合 | providers.openrouter |
| google | Gemini | providers.google |
| local | 本地模型 (Ollama) | providers.local |

### 6.3 Auth 配置

```typescript
// 支持多种认证方式
type AuthMode =
  | { type: "api-key"; key: string }
  | { type: "env-var"; name: string }
  | { type: "oauth"; config: OAuthConfig };
```

---

## 7. 错误处理与 Fallback

### 7.1 Failover 策略

```typescript
// src/agents/failover-error.ts
export function resolveFailoverStatus(error: Error): FailoverStatus {
  if (isRateLimitError(error)) return "retry_with_backoff";
  if (isAuthError(error)) return "auth_failure";
  if (isContextOverflowError(error)) return "compact_and_retry";
  if (isModelUnavailableError(error)) return "switch_model";
  return "give_up";
}
```

### 7.2 模型切换

```typescript
// 当主模型失败时
async function handleModelFailure(error: Error): Promise<void> {
  // 1. 记录失败
  await recordModelFailure(modelId, error);

  // 2. 检查是否有 fallback 模型
  const fallback = getFallbackModel(currentModel);
  if (fallback) {
    // 3. 切换到 fallback 模型
    await switchToModel(fallback);
  }
}
```

### 7.3 认证失败处理

```typescript
// Auth Profile 轮换
async function withAuthProfileRotation<T>(
  fn: (auth: AuthProfile) => Promise<T>
): Promise<T> {
  const profiles = getAuthProfiles(provider);
  for (const profile of profiles) {
    try {
      return await fn(profile);
    } catch (error) {
      if (isAuthError(error)) {
        markAuthProfileFailure(profile.id);
        continue;
      }
      throw error;
    }
  }
  throw new Error("All auth profiles exhausted");
}
```

---

## 8. Agent 作用域 (Agent Scope)

### 8.1 工作目录

```typescript
// 每个 Agent 有独立的工作目录
const agentDir = resolveAgentDir(agentId);
// ~/.openclaw/agents/<agent-id>/
```

### 8.2 配置隔离

```typescript
// Agent 配置
interface AgentScopeConfig {
  id: string;
  workspaceDir: string;    // 工作目录
  tools: string[];        // 可用工具
  model?: string;          // 使用的模型
  // ...
}
```

---

## 9. 子 Agent (Subagent)

OpenClaw 支持创建子 Agent：

```typescript
// src/agents/subagent-spawn.ts
export async function spawnSubagent(params: {
  parentSessionId: string;
  agentId: string;
  prompt: string;
  options?: SpawnOptions;
}): Promise<SubagentHandle> {
  // 创建子 Agent
  // 子 Agent 共享父 Agent 的上下文
  // 但有独立的 tool 权限和执行限制
}
```

**子 Agent 的使用场景**：
- 后台任务处理
- 并行工具调用
- 复杂查询分解

---

## 10. Agent 与 Plugin 的交互

### 10.1 Hook 注入点

```
Agent 生命周期中的 Hook：

before_agent_start    ──► Agent 启动前
       │
       ▼
before_prompt_build   ──► 构建提示前
       │
       ▼
llm_input             ──► LLM 输入
       │
       ▼
[Model Processing]
       │
       ▼
llm_output            ──► LLM 输出
       │
       ▼
before_tool_call      ──► 工具调用前
       │
       ▼
[Tool Execution]
       │
       ▼
after_tool_call       ──► 工具调用后
       │
       ▼
before_agent_reply    ──► 回复前
       │
       ▼
after_agent_finalize  ──► Agent 结束
```

### 10.2 工具提供

Plugin 可以向 Agent 提供额外工具：

```typescript
// Plugin 添加工具
const plugin = {
  id: "web-search",
  tools: [
    { name: "web_search", handler: searchHandler },
    { name: "web_fetch", handler: fetchHandler }
  ]
};
```

---

## 11. 配置示例

```yaml
agents:
  my-agent:
    model: claude-sonnet-4-20250514
    provider: anthropic
    systemPrompt: |
      你是一个专业的编程助手。
      专注于代码质量和最佳实践。
    tools:
      - bash
      - read
      - write
      - web_search
    # 模型覆盖
    modelOverrikes:
      "claude-sonnet-4-20250514":
        maxTokens: 8192
    # 认证配置
    authProfile: default
```

---

## 12. 缺点与不足

| 缺点 | 说明 |
|------|------|
| **上下文窗口管理复杂** | compaction 逻辑分散在多处，难以理解和调试 |
| **模型切换时机** | 自动切换模型的策略不够透明 |
| **工具执行串行** | 工具调用是串行的，多工具并行能力有限 |
| **错误信息冗长** | Failover 过程中的错误信息层层包裹 |
| **测试困难** | Agent 测试依赖 mock，真实场景测试复杂 |

---

## 13. 核心设计决策

| 决策 | 为什么这样做 | 不这样做的后果 |
|------|--------------|----------------|
| 模型选择抽象 | 支持多 Provider 和 fallback | 只能绑定单一模型 |
| Context 压缩 | 避免 token 溢出，保持对话流畅 | 长对话会失败 |
| 工具循环检测 | 防止 Agent 陷入死循环 | Agent 可能卡住 |
| Auth Profile 轮换 | 提高 API 调用的可靠性 | API 失败时无备用方案 |
| 子 Agent 机制 | 支持复杂任务的分解执行 | 复杂任务无法并行处理 |

---

## 14. 下一步

- [05_Channel系统.md](./05_Channel系统.md) - 理解消息渠道接入