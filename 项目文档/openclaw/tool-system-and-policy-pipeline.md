# 工具系统与策略管线详解

> 目标：理解为什么模型不会"无限制调用所有工具"，而是通过策略管线受控执行。

---

## 一、整体架构：为什么需要策略管线？

当你使用 AI 模型时，模型本身是"天真"的——它会尽可能调用任何它认为有用的工具。如果没有控制机制，模型可能会：
- 调用管理员级别的危险操作（如 `gateway`、`whatsapp_login`）
- 在不该调用 `exec` 的场景下执行 shell 命令
- 访问不该访问的文件路径

**OpenClaw 的设计理念**：不是"先猜模型应该有哪些工具"，而是**先构建所有候选工具，再通过策略管线一层层过滤**。

```
候选工具集合 (可能是 30+ 个工具)
        │
        ▼
┌───────────────────┐
│ 1. Profile 过滤   │  ← "minimal" | "coding" | "messaging" | "full"
├───────────────────┤
│ 2. Provider 过滤  │  ← 按模型提供商 (anthropic/openai/google...)
├───────────────────┤
│ 3. 全局策略过滤   │  ← tools.allow / tools.deny
├───────────────────┤
│ 4. Agent 策略过滤 │  ← agents.<id>.tools.allow
├───────────────────┤
│ 5. Group 策略过滤 │  ← 群组级别权限
├───────────────────┤
│ 6. Sandbox 过滤   │  ← 沙箱工具限制
├───────────────────┤
│ 7. Subagent 过滤   │  ← 子 agent 能力限制
├───────────────────┤
│ 8. Owner 过滤     │  ← 敏感工具仅 owner 可用
├───────────────────┤
│ 9. Hook 拦截      │  ← before_tool_call 钩子
└───────────────────┘
        │
        ▼
最终工具列表 (可能只剩 5-10 个)
```

---

## 二、工具来源：三类工具

### 2.1 基础 Coding Tools（来自 `@mariozechner/pi-coding-agent`）

这是 OpenClaw 集成的基础编码工具包，提供了最核心的文件操作和执行能力：

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `read` | 读取文件 | 可配置为沙箱模式 |
| `write` | 写入文件 | 带 workspace root guard |
| `edit` | 编辑文件 | 精确修改而非覆盖 |
| `apply_patch` | 补丁应用 | 仅 OpenAI 模型可用 |
| `exec` | 执行命令 | 最危险的工具，受最多限制 |
| `process` | 进程管理 | 管理后台进程 |

**代码入口** (`src/agents/pi-tools.ts:366-408`)：

```typescript
// 从 codingTools 包中提取基础工具
const base = (codingTools as unknown as AnyAgentTool[]).flatMap((tool) => {
  if (tool.name === readTool.name) {
    // 根据是否启用沙箱，选择沙箱版或普通版 read 工具
    if (sandboxRoot) {
      return [createSandboxedReadTool({...})];
    }
    return [createOpenClawReadTool(freshReadTool, {...})];
  }
  if (tool.name === "bash" || tool.name === execToolName) {
    return [];  // bash 被重命名为 exec
  }
  if (tool.name === "write") {
    // 返回带 guard 的 write 工具
    return [createHostWorkspaceWriteTool(workspaceRoot, { workspaceOnly })];
  }
  // ...
});
```

### 2.2 OpenClaw 平台工具（来自 `src/agents/openclaw-tools.ts`）

这些是 OpenClaw 平台特有的工具，用于消息发送、会话管理、浏览器控制等：

| 工具名 | 功能 | 所属分类 |
|--------|------|----------|
| `message` | 发送消息 | Messaging |
| `browser` | 浏览器控制 | UI |
| `canvas` | Canvas 控制 | UI |
| `sessions_list` | 列出会话 | Sessions |
| `sessions_history` | 会话历史 | Sessions |
| `sessions_send` | 发送消息到会话 | Sessions |
| `sessions_spawn` | 派生子 agent | Sessions |
| `sessions_yield` | 让出控制权 | Sessions |
| `subagents` | 管理子 agent | Sessions |
| `cron` | 定时任务 | Automation |
| `gateway` | 网关控制 | Automation |
| `nodes` | 节点/设备控制 | Nodes |
| `agents_list` | 列出 agent | Agents |
| `image` | 图片理解 | Media |
| `tts` | 文本转语音 | Media |
| `web_search` | 网络搜索 | Web |
| `web_fetch` | 网页抓取 | Web |

**代码入口** (`src/agents/openclaw-tools.ts:139-240`)：

```typescript
const tools: AnyAgentTool[] = [
  createBrowserTool({...}),
  createCanvasTool({...}),
  createNodesTool({...}),
  createCronTool({...}),
  messageTool ? [messageTool] : [],  // 可选
  createTtsTool({...}),
  createGatewayTool({...}),
  // ... 更多工具
];

// 动态加载插件工具
const pluginTools = resolvePluginTools({
  context: { config, workspaceDir, agentId, ... },
  existingToolNames: new Set(tools.map((tool) => tool.name)),
  toolAllowlist: options?.pluginToolAllowlist,
});

return [...tools, ...pluginTools];
```

### 2.3 插件工具（动态加载）

插件工具由外部插件提供，通过 `resolvePluginTools()` 动态加载。插件工具会经过和白名单检查后才被合并到工具列表。

---

## 三、策略解析：从配置到策略对象

### 3.1 策略的层次结构

```
Config (OpenClawConfig)
  │
  ├── tools:
  │     ├── profile: "coding"           ← Profile 策略
  │     ├── byProvider: { ... }         ← Provider 级别策略
  │     ├── allow: ["read", "write"]     ← 全局允许列表
  │     ├── deny: ["gateway"]            ← 全局禁止列表
  │     └── alsoAllow: ["exec"]          ← 额外允许（补充）
  │
  └── agents:
        └── <agentId>:
              └── tools:
                    ├── allow: [...]
                    ├── deny: [...]
                    └── byProvider: {...}
```

### 3.2 策略解析函数 (`src/agents/pi-tools.policy.ts`)

**核心函数：`resolveEffectiveToolPolicy()`**

```typescript
export function resolveEffectiveToolPolicy(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  agentId?: string;
  modelProvider?: string;
  modelId?: string;
}) {
  // 1. 解析 agentId
  const agentId = explicitAgentId ?? resolveAgentIdFromSessionKey(params.sessionKey);

  // 2. 获取 agent 和全局 tools 配置
  const agentTools = agentConfig?.tools;
  const globalTools = params.config?.tools;

  // 3. 解析 profile 策略 (如 "coding" → ["read", "write", "edit", "exec", ...])
  const profile = agentTools?.profile ?? globalTools?.profile;

  // 4. 解析 Provider 级别策略
  const providerPolicy = resolveProviderToolPolicy({
    byProvider: globalTools?.byProvider,
    modelProvider: params.modelProvider,
    modelId: params.modelId,
  });

  // 5. 解析 alsoAllow（隐式 + 显式）
  //    如果配置了 exec/fs，则隐式允许 process/read/write 等
  const implicitProfileAlsoAllow = resolveImplicitProfileAlsoAllow({...});

  return {
    agentId,
    globalPolicy,           // pickSandboxToolPolicy(globalTools)
    globalProviderPolicy,   // pickSandboxToolPolicy(providerPolicy)
    agentPolicy,
    agentProviderPolicy,
    profile,                // "coding" | "messaging" | "minimal" | "full"
    providerProfile,
    profileAlsoAllow,
    providerProfileAlsoAllow,
  };
}
```

### 3.3 Profile 策略映射 (`src/agents/tool-catalog.ts`)

```typescript
const CORE_TOOL_PROFILES: Record<ToolProfileId, ToolProfilePolicy> = {
  minimal: {
    allow: ["session_status"],  // 只有状态查询
  },
  coding: {
    allow: [
      "read", "write", "edit", "apply_patch",  // 文件操作
      "exec", "process",                        // 执行
      "web_search", "web_fetch",                // Web
      "memory_search", "memory_get",           // 记忆
      "sessions_list", "sessions_history",      // 会话
      "sessions_send", "sessions_spawn",        // 会话操作
      "sessions_yield", "subagents",            // 子 agent
      "session_status",                         // 状态
      "browser", "canvas",                      // UI
      "image",                                  // 媒体
    ],
  },
  messaging: {
    allow: [
      "message",           // 消息发送
      "sessions_list", "sessions_history", "sessions_send",
      "session_status",
    ],
  },
  full: {},  // 不限制，允许所有工具
};
```

---

## 四、策略管线执行 (`src/agents/tool-policy-pipeline.ts`)

### 4.1 管线步骤构建

```typescript
export function buildDefaultToolPolicyPipelineSteps(params: {
  profilePolicy?: ToolPolicyLike;
  profile?: string;
  providerProfilePolicy?: ToolPolicyLike;
  providerProfile?: string;
  globalPolicy?: ToolPolicyLike;
  globalProviderPolicy?: ToolPolicyLike;
  agentPolicy?: ToolPolicyLike;
  agentProviderPolicy?: ToolPolicyLike;
  groupPolicy?: ToolPolicyLike;
  agentId?: string;
}): ToolPolicyPipelineStep[] {
  return [
    // 1. Profile 级别
    { policy: params.profilePolicy, label: "tools.profile (coding)", stripPluginOnlyAllowlist: true },
    // 2. Provider Profile 级别
    { policy: params.providerProfilePolicy, label: "tools.byProvider.profile", stripPluginOnlyAllowlist: true },
    // 3. 全局 allow
    { policy: params.globalPolicy, label: "tools.allow", stripPluginOnlyAllowlist: true },
    // 4. 全局 Provider allow
    { policy: params.globalProviderPolicy, label: "tools.byProvider.allow", stripPluginOnlyAllowlist: true },
    // 5. Agent 级别
    { policy: params.agentPolicy, label: "agents.<id>.tools.allow", stripPluginOnlyAllowlist: true },
    // 6. Agent Provider 级别
    { policy: params.agentProviderPolicy, label: "agents.<id>.tools.byProvider.allow", stripPluginOnlyAllowlist: true },
    // 7. Group 级别
    { policy: params.groupPolicy, label: "group tools.allow", stripPluginOnlyAllowlist: true },
  ];
}
```

### 4.2 管线执行逻辑

```typescript
export function applyToolPolicyPipeline(params: {
  tools: AnyAgentTool[];
  toolMeta: (tool: AnyAgentTool) => { pluginId: string } | undefined;
  warn: (message: string) => void;
  steps: ToolPolicyPipelineStep[];
}): AnyAgentTool[] {
  // 1. 识别核心工具（无 pluginId 的工具）
  const coreToolNames = new Set(
    params.tools
      .filter((tool) => !params.toolMeta(tool))
      .map((tool) => normalizeToolName(tool.name))
  );

  // 2. 构建插件工具组
  const pluginGroups = buildPluginToolGroups({...});

  let filtered = params.tools;

  // 3. 逐个应用策略步骤
  for (const step of params.steps) {
    if (!step.policy) continue;  // 跳过未定义的策略

    let policy = step.policy;

    // 4. 剥离插件专属白名单（防止意外禁用核心工具）
    if (step.stripPluginOnlyAllowlist) {
      const resolved = stripPluginOnlyAllowlist(policy, pluginGroups, coreToolNames);
      if (resolved.unknownAllowlist.length > 0) {
        params.warn(`tools: ${step.label} allowlist contains unknown entries...`);
      }
      policy = resolved.policy;
    }

    // 5. 展开插件组（如 "group:plugins" → ["plugin-tool-1", "plugin-tool-2"]）
    const expanded = expandPolicyWithPluginGroups(policy, pluginGroups);

    // 6. 根据策略过滤工具
    filtered = expanded ? filterToolsByPolicy(filtered, expanded) : filtered;
  }

  return filtered;
}
```

### 4.3 工具过滤核心 (`src/agents/tool-policy-match.ts`)

```typescript
function makeToolPolicyMatcher(policy: SandboxToolPolicy) {
  // 编译 glob 模式
  const deny = compileGlobPatterns({ raw: expandToolGroups(policy.deny ?? []), normalize: normalizeToolName });
  const allow = compileGlobPatterns({ raw: expandToolGroups(policy.allow ?? []), normalize: normalizeToolName });

  return (name: string) => {
    const normalized = normalizeToolName(name);

    // 1. 先检查 deny 列表（deny 优先）
    if (matchesAnyGlobPattern(normalized, deny)) {
      return false;
    }

    // 2. 如果没有 allow 列表，默认允许
    if (allow.length === 0) {
      return true;
    }

    // 3. 检查 allow 列表
    if (matchesAnyGlobPattern(normalized, allow)) {
      return true;
    }

    // 4. 特殊逻辑：apply_patch 被 exec 的 allow 覆盖
    if (normalized === "apply_patch" && matchesAnyGlobPattern("exec", allow)) {
      return true;
    }

    return false;
  };
}
```

---

## 五、关键安全机制

### 5.1 Owner-Only 工具保护

某些工具只能由"owner"（管理员）调用，普通用户会被拦截：

```typescript
// src/agents/tool-policy.ts

const OWNER_ONLY_TOOL_NAME_FALLBACKS = new Set([
  "whatsapp_login",
  "cron",
  "gateway",
  "nodes",
]);

function wrapOwnerOnlyToolExecution(tool: AnyAgentTool, senderIsOwner: boolean): AnyAgentTool {
  if (tool.ownerOnly !== true || senderIsOwner || !tool.execute) {
    return tool;
  }
  // 非 owner 调用时，直接抛出错误
  return {
    ...tool,
    execute: async () => {
      throw new Error("Tool restricted to owner senders.");
    },
  };
}

export function applyOwnerOnlyToolPolicy(tools: AnyAgentTool[], senderIsOwner: boolean) {
  const withGuard = tools.map((tool) => {
    if (!isOwnerOnlyTool(tool)) {
      return tool;
    }
    return wrapOwnerOnlyToolExecution(tool, senderIsOwner);
  });

  // Owner 看到完整工具列表（带 guard）
  // 非 Owner 的工具列表会移除 owner-only 工具
  if (senderIsOwner) {
    return withGuard;
  }
  return withGuard.filter((tool) => !isOwnerOnlyTool(tool));
}
```

### 5.2 `apply_patch` 与 `exec` 的模型限制

不是所有模型都能使用 `apply_patch`（OpenAI 的代码编辑工具）：

```typescript
// src/agents/pi-tools.ts

function isApplyPatchAllowedForModel(params: {
  modelProvider?: string;
  modelId?: string;
  allowModels?: string[];
}) {
  const allowModels = Array.isArray(params.allowModels) ? params.allowModels : [];

  // 如果没有配置 allowModels，默认允许
  if (allowModels.length === 0) {
    return true;
  }

  // 检查 modelId 是否在 allowModels 列表中
  const modelId = params.modelId?.trim();
  if (!modelId) {
    return false;
  }
  // 匹配逻辑支持完整 ID 或 provider/id 格式
  return allowModels.some((entry) => {
    const normalized = entry.trim().toLowerCase();
    return normalized === normalizedModelId || normalized === normalizedFull;
  });
}

// 应用条件
const applyPatchEnabled =
  !!applyPatchConfig?.enabled &&                              // 配置启用
  isOpenAIProvider(options?.modelProvider) &&               // 必须是 OpenAI
  isApplyPatchAllowedForModel({                              // 模型在白名单中
    modelProvider: options?.modelProvider,
    modelId: options?.modelId,
    allowModels: applyPatchConfig?.allowModels,
  });
```

### 5.3 Workspace Root Guard（防止越界写）

所有文件操作工具都受 workspace root guard 保护，防止模型访问配置目录等敏感位置：

```typescript
// src/agents/pi-tools.read.js

export function wrapToolWorkspaceRootGuard(tool: AnyAgentTool, root: string): AnyAgentTool {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // 在执行前检查文件路径是否在 root 内
      if (!isPathInRoot(params.path, root)) {
        throw new Error(`Path "${params.path}" is outside workspace root "${root}"`);
      }
      return tool.execute(toolCallId, params, signal, onUpdate);
    },
  };
}
```

### 5.4 Subagent 工具限制

子 agent 有额外的限制，防止它们执行危险操作：

```typescript
// src/agents/pi-tools.policy.ts

// 子 agent 永远不能使用的工具
const SUBAGENT_TOOL_DENY_ALWAYS = [
  "gateway",           // 系统管理
  "agents_list",       // 列出 agent
  "whatsapp_login",    // 交互式登录
  "session_status",     // 状态查询
  "cron",              // 定时任务
  "memory_search",     // 记忆搜索
  "memory_get",        // 记忆读取
  "sessions_send",     // 直接发送
];

// 叶子节点（最深层的子 agent）额外不能使用
const SUBAGENT_TOOL_DENY_LEAF = [
  "subagents",         // 不能管理子 agent
  "sessions_list",     // 不能列出会话
  "sessions_history",  // 不能看历史
  "sessions_spawn",    // 不能派生
];
```

---

## 六、Hook 系统（before_tool_call / after_tool_call）

### 6.1 Hook 执行时机

```
模型请求调用工具
        │
        ▼
┌───────────────────┐
│ before_tool_call  │  ← 插件钩子可以：
│     钩 子         │     1. 阻止调用 (block: true)
│                   │     2. 修改参数 (params: {...})
├───────────────────┤
│ 循环检测          │  ← 检测同一工具的重复调用
├───────────────────┤
│ 执行工具          │
├───────────────────┤
│ after_tool_call   │  ← 目前通过 recordLoopOutcome 记录
│     钩 子         │
└───────────────────┘
```

### 6.2 循环检测 (`src/agents/pi-tools.before-tool-call.ts`)

```typescript
export async function runBeforeToolCallHook(args: {
  toolName: string;
  params: unknown;
  toolCallId?: string;
  ctx?: HookContext;
}): Promise<HookOutcome> {
  const toolName = normalizeToolName(args.toolName);

  // 1. 循环检测
  if (args.ctx?.sessionKey) {
    const loopResult = detectToolCallLoop(
      sessionState,
      toolName,
      params,
      args.ctx.loopDetection
    );

    if (loopResult.stuck) {
      if (loopResult.level === "critical") {
        // 严重循环：直接阻止
        return { blocked: true, reason: loopResult.message };
      } else {
        // 警告循环：记录但不阻止
        log.warn(`Loop warning for ${toolName}: ${loopResult.message}`);
      }
    }

    recordToolCall(sessionState, toolName, params, args.toolCallId, ...);
  }

  // 2. 插件钩子
  const hookRunner = getGlobalHookRunner();
  if (hookRunner?.hasHooks("before_tool_call")) {
    const hookResult = await hookRunner.runBeforeToolCall({...});

    if (hookResult?.block) {
      return { blocked: true, reason: hookResult.blockReason };
    }

    if (hookResult?.params) {
      return { blocked: false, params: { ...params, ...hookResult.params } };
    }
  }

  return { blocked: false, params: args.params };
}
```

---

## 七、错误处理：工具不会"炸进程"

当工具执行失败时，不会直接抛出异常导致整个 agent 崩溃，而是转换为结构化错误结果：

```typescript
// src/agents/pi-tool-definition-adapter.ts

export function toToolDefinitions(tools: AnyAgentTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name,
    description,
    parameters: tool.parameters,
    execute: async (...args): Promise<AgentToolResult<unknown>> => {
      try {
        const rawResult = await tool.execute(toolCallId, params, signal, onUpdate);
        return normalizeToolExecutionResult({ toolName, result: rawResult });
      } catch (err) {
        // 1. AbortError 不捕获（让它传播）
        if (signal?.aborted || name === "AbortError") {
          throw err;
        }

        // 2. 其他错误转换为结构化错误结果
        logError(`[tools] ${normalizedName} failed: ${described.message}`);

        return jsonResult({
          status: "error",
          tool: normalizedName,
          error: described.message,
        });
      }
    },
  }));
}
```

返回格式：
```typescript
{
  content: [{ type: "text", text: "错误信息" }],
  details: {
    status: "error",
    tool: "tool_name",
    error: "具体错误描述"
  }
}
```

---

## 八、完整工具构建流程

```typescript
// src/agents/pi-tools.ts - createOpenClawCodingTools()

export function createOpenClawCodingTools(options?): AnyAgentTool[] {
  // ========== 步骤 1: 解析策略 ==========
  const { globalPolicy, agentPolicy, groupPolicy, profilePolicy, ... }
    = resolveEffectiveToolPolicy({...});

  // ========== 步骤 2: 构建基础工具集 ==========
  const base = [...codingTools];  // read, write, edit, exec, process

  // ========== 步骤 3: 添加 OpenClaw 平台工具 ==========
  const openclawTools = createOpenClawTools({...});

  // ========== 步骤 4: 合并所有工具 ==========
  let tools = [...base, ...openclawTools];

  // ========== 步骤 5: 按消息 Provider 过滤 ==========
  // (如 voice provider 禁用 tts)
  tools = applyMessageProviderToolPolicy(tools, options.messageProvider);

  // ========== 步骤 6: 按模型 Provider 过滤 ==========
  // (如 xAI provider 禁用 web_search)
  tools = applyModelProviderToolPolicy(tools, { modelProvider, modelId });

  // ========== 步骤 7: Owner 过滤 ==========
  tools = applyOwnerOnlyToolPolicy(tools, senderIsOwner);

  // ========== 步骤 8: 策略管线过滤 ==========
  tools = applyToolPolicyPipeline({
    tools,
    steps: [
      ...buildDefaultToolPolicyPipelineSteps({...}),  // profile → global → agent → group
      { policy: sandbox?.tools, label: "sandbox tools.allow" },
      { policy: subagentPolicy, label: "subagent tools.allow" },
    ],
  });

  // ========== 步骤 9: 规范化参数 Schema ==========
  tools = tools.map((tool) => normalizeToolParameters(tool, { modelProvider, modelId }));

  // ========== 步骤 10: 包装 Hook ==========
  tools = tools.map((tool) => wrapToolWithBeforeToolCallHook(tool, { agentId, sessionKey, ... }));

  // ========== 步骤 11: 包装 AbortSignal ==========
  tools = options?.abortSignal
    ? tools.map((tool) => wrapToolWithAbortSignal(tool, options.abortSignal))
    : tools;

  return tools;
}
```

---

## 九、配置示例

```yaml
# 全局工具配置
tools:
  # Profile 模式
  profile: coding  # minimal | coding | messaging | full

  # 全局允许/禁止
  allow:
    - read
    - write
    - edit
    - exec
  deny:
    - gateway

  # Provider 特定配置
  byProvider:
    anthropic:
      allow: ["read", "write", "message"]
    openai:
      allow: ["*"]  # 允许所有
      deny: ["gateway"]

# Agent 特定配置
agents:
  my-agent:
    tools:
      profile: minimal
      allow:
        - read
      deny:
        - exec
```

---

## 十、学习要点总结

1. **不是"猜"，是"过滤"**：先构建全部，再逐层过滤，避免遗漏
2. **Deny 优先**：先检查 deny 列表，再检查 allow 列表
3. **多层策略叠加**：profile → global → agent → group → sandbox → subagent
4. **安全默认值**：未知工具默认被拒绝（opt-in）
5. **错误不崩溃**：工具异常转换为结构化结果，不影响 agent 运行
6. **Hook 扩展点**：通过 before_tool_call 钩子实现参数修改和调用拦截
7. **循环保护**：防止模型陷入同一工具的无限循环
8. **Owner 隔离**：敏感工具只有管理员能用

---

## 相关文件索引

| 文件 | 作用 |
|------|------|
| `src/agents/pi-tools.ts` | 主入口，工具构建和策略应用 |
| `src/agents/openclaw-tools.ts` | OpenClaw 平台工具创建 |
| `src/agents/pi-tools.policy.ts` | 策略解析（profile/global/agent/group） |
| `src/agents/tool-policy-pipeline.ts` | 策略管线执行 |
| `src/agents/tool-policy.ts` | 策略工具函数（展开/合并/剥离） |
| `src/agents/tool-policy-match.ts` | 工具匹配逻辑 |
| `src/agents/tool-catalog.ts` | 工具目录和 Profile 定义 |
| `src/agents/pi-tools.before-tool-call.ts` | Hook 和循环检测 |
| `src/agents/pi-tool-definition-adapter.ts` | 工具定义适配和错误处理 |
| `src/agents/pi-tools.read.js` | Workspace root guard 实现 |
