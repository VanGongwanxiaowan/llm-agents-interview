# OpenClaw 通道适配器框架与账号生命周期

## 一句话理解

OpenClaw 把每个平台（Telegram/Discord/Signal/iMessage 等）都抽象成同一套 **`ChannelPlugin` 适配器合同**。核心系统不需要知道"某个平台的私有细节"，只要按统一接口调用即可。

如果你要做类似项目，这一章就是"多通道架构"的核心设计。

---

## 二、全链路追踪（实现入口总览）

```
通道接口合同定义
└── src/channels/plugins/types.plugin.ts      ← ChannelPlugin 类型定义

插件注册通道能力
└── src/plugins/registry.ts                 ← registerChannel() 把插件放进 registry

网关启动/停止通道
└── src/gateway/server-channels.ts          ← createChannelManager() 管理账号生命周期

入站消息路由到 agent
└── src/routing/resolve-route.ts            ← resolveAgentRoute() 匹配 bindings，返回 agentId + sessionKey

出站消息走统一适配器
└── src/infra/outbound/deliver.ts           ← deliverOutboundPayloads() 统一发送编排

通道状态探测与体检
└── src/gateway/server-methods/channels.ts   ← channels status --probe 时调用
```

---

## 三、核心类型系统（最关键）

### 3.1 ChannelPlugin 主接口

位置：`src/channels/plugins/types.plugin.ts:53-92`

```typescript
export type ChannelPlugin<ResolvedAccount = any, Probe = unknown, Audit = unknown> = {
  id: ChannelId                                    // 唯一标识，如 "telegram"
  meta: ChannelMeta                                // 通道的展示信息（label、docsPath 等）
  capabilities: ChannelCapabilities                // 能力声明（是否支持 polls、media 等）

  // 账号配置读写（最核心的适配器）
  config: ChannelConfigAdapter<ResolvedAccount>   // 从配置里读账号、解析账号

  // 网关启动/停止时调用
  gateway?: ChannelGatewayAdapter<ResolvedAccount> // startAccount、stopAccount、logoutAccount

  // AI 回复如何发回该平台
  outbound?: ChannelOutboundAdapter               // sendText、sendMedia、sendPoll

  // channels status --probe 时怎么体检
  status?: ChannelStatusAdapter<ResolvedAccount, Probe, Audit>

  // 登录/登出流程
  auth?: ChannelAuthAdapter                       // login()

  // 配对/白名单
  pairing?: ChannelPairingAdapter

  // 群组管理
  groups?: ChannelGroupAdapter

  // 安全策略（DM 白名单等）
  security?: ChannelSecurityAdapter<ResolvedAccount>

  // 生命周期钩子
  lifecycle?: ChannelLifecycleAdapter
}
```

**通俗理解**：你可以把 `ChannelPlugin` 看成"通道驱动程序接口"。每个平台（Telegram/Discord/Signal）都实现这个接口，网关和核心系统只调用接口，不直接写平台私有代码。

### 3.2 六大核心适配器详解

#### ChannelConfigAdapter — 账号配置读写

```typescript
export type ChannelConfigAdapter<ResolvedAccount> = {
  // 列出所有账号 ID
  listAccountIds: (cfg: OpenClawConfig) => string[]

  // 根据 accountId 解析出完整的账号配置对象
  resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) => ResolvedAccount

  // 检查账号是否已配置（如 token 是否填写）
  isConfigured?: (account: ResolvedAccount, cfg: OpenClawConfig) => boolean | Promise<boolean>

  // 检查账号是否启用
  isEnabled?: (account: ResolvedAccount, cfg: OpenClawConfig) => boolean

  // 描述账号快照（用于 status 显示）
  describeAccount?: (account: ResolvedAccount, cfg: OpenClawConfig) => ChannelAccountSnapshot
}
```

**处理细节**（以 Telegram 为例）：

```typescript
// extensions/telegram/src/channel.ts:413-444
config: {
  listAccountIds: listTelegramAccountIds,           // 从配置中读取所有账号
  resolveAccount: (cfg, accountId) => resolveTelegramAccount({ cfg, accountId }),

  // token 是否填写 + 是否重复使用
  isConfigured: (account, cfg) => {
    if (!account.token?.trim()) return false
    return !findTelegramTokenOwnerAccountId({ cfg, accountId: account.accountId })
  },

  describeAccount: (account, cfg) => ({
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled,
    configured: Boolean(account.token?.trim()),
    tokenSource: account.tokenSource,
  }),
}
```

#### ChannelGatewayAdapter — 网关启动/停止

```typescript
export type ChannelGatewayAdapter<ResolvedAccount = unknown> = {
  // 网关启动时调用，拉起长连接/webhook 等
  startAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<unknown>

  // 网关停止时调用，清理资源
  stopAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<void>

  // 二维码登录（可选）
  loginWithQrStart?: (params: {...}) => Promise<ChannelLoginWithQrStartResult>
  loginWithQrWait?: (params: {...}) => Promise<ChannelLoginWithQrWaitResult>

  // 登出账号
  logoutAccount?: (ctx: ChannelLogoutContext<ResolvedAccount>) => Promise<ChannelLogoutResult>
}
```

**处理细节**：

`startAccount` 的上下文 `ChannelGatewayContext` 包含：
- `cfg` — 完整配置
- `accountId` — 当前账号 ID
- `account` — 已解析的账号对象
- `runtime` — 运行时环境变量
- `abortSignal` — 中止信号（用于优雅关闭）
- `log` — 日志记录器
- `getStatus()` / `setStatus()` — 读写账号运行状态

```typescript
// extensions/telegram/src/channel.ts:800-847
gateway: {
  startAccount: async (ctx) => {
    const account = ctx.account

    // 1. 验证 token 唯一性（不能多个账号共用一个 bot token）
    const ownerAccountId = findTelegramTokenOwnerAccountId({ cfg: ctx.cfg, accountId: account.accountId })
    if (ownerAccountId) {
      throw new Error(`Duplicate Telegram bot token...`)
    }

    // 2. 探测 bot 信息（获取 username 等）
    const probe = await getTelegramRuntime().channel.telegram.probeTelegram(token, 2500, {...})

    // 3. 启动长连接或 webhook 监听
    return getTelegramRuntime().channel.telegram.monitorTelegramProvider({
      token,
      accountId: account.accountId,
      config: ctx.cfg,
      runtime: ctx.runtime,
      abortSignal: ctx.abortSignal,    // ← 关键：支持优雅关闭
      useWebhook: Boolean(account.config.webhookUrl),
      webhookUrl: account.config.webhookUrl,
      webhookSecret: account.config.webhookSecret,
      webhookPath: account.config.webhookPath,
      webhookHost: account.config.webhookHost,
      webhookPort: account.config.webhookPort,
      webhookCertPath: account.config.webhookCertPath,
    })
  }
}
```

#### ChannelOutboundAdapter — 出站消息发送

```typescript
export type ChannelOutboundAdapter = {
  deliveryMode: "direct" | "gateway" | "hybrid"   // 发送模式
  chunker?: (text: string, limit: number) => string[]  // 长文本切片

  // 高级发送（处理 payload 结构）
  sendPayload?: (ctx: ChannelOutboundPayloadContext) => Promise<OutboundDeliveryResult>

  // 格式化文本/媒体发送
  sendFormattedText?: (ctx: ChannelOutboundFormattedContext) => Promise<OutboundDeliveryResult[]>
  sendFormattedMedia?: (ctx: ChannelOutboundFormattedContext & { mediaUrl: string }) => Promise<OutboundDeliveryResult>

  // 基础发送
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>

  // 投票发送
  sendPoll?: (ctx: ChannelPollContext) => Promise<ChannelPollResult>
}
```

**处理细节**（以 Telegram 为例）：

```typescript
// extensions/telegram/src/channel.ts:601-688
outbound: {
  deliveryMode: "direct",

  // Markdown 文本切片器（Telegram 最大 4096 字符）
  chunker: (text, limit) => getTelegramRuntime().channel.text.chunkMarkdownText(text, limit),
  chunkerMode: "markdown",
  textChunkLimit: 4000,

  // 发送文本消息
  sendText: async ({ cfg, to, text, accountId, deps, replyToId, threadId, silent }) => {
    const result = await sendTelegramOutbound({ cfg, to, text, accountId, deps, replyToId, threadId, silent })
    return { channel: "telegram", ...result }
  },

  // 发送媒体（图片/视频等）
  sendMedia: async ({ cfg, to, text, mediaUrl, ... }) => {
    const result = await sendTelegramOutbound({ cfg, to, text, mediaUrl, ... })
    return { channel: "telegram", ...result }
  },

  // 发送投票
  sendPoll: async ({ cfg, to, poll, accountId, threadId, silent, isAnonymous }) =>
    await getTelegramRuntime().channel.telegram.sendPollTelegram(to, poll, {...}),
}
```

#### ChannelStatusAdapter — 状态探测

```typescript
export type ChannelStatusAdapter<ResolvedAccount, Probe = unknown, Audit = unknown> = {
  defaultRuntime?: ChannelAccountSnapshot           // 默认状态快照

  // 执行探测（如调用 Telegram API 确认 bot 是否可连通）
  probeAccount?: (params: {
    account: ResolvedAccount
    timeoutMs: number
    cfg: OpenClawConfig
  }) => Promise<Probe>

  // 格式化探测结果（用于 CLI 显示）
  formatCapabilitiesProbe?: (params: { probe: Probe }) => ChannelCapabilitiesDisplayLine[]

  // 审计（如检查 bot 是否在所有配置的群组中）
  auditAccount?: (params: {...}) => Promise<Audit>

  // 构建账号快照
  buildAccountSnapshot?: (params: {...}) => ChannelAccountSnapshot | Promise<ChannelAccountSnapshot>

  // 收集状态问题
  collectStatusIssues?: (accounts: ChannelAccountSnapshot[]) => ChannelStatusIssue[]
}
```

#### ChannelAuthAdapter — 登录认证

```typescript
export type ChannelAuthAdapter = {
  login?: (params: {
    cfg: OpenClawConfig
    accountId?: string | null
    runtime: RuntimeEnv
    verbose?: boolean
    channelInput?: string | null   // 如二维码扫描结果
  }) => Promise<void>
}
```

#### ChannelLifecycleAdapter — 配置变更钩子

```typescript
export type ChannelLifecycleAdapter = {
  // 账号配置变更时调用（如 token 改了）
  onAccountConfigChanged?: (params: {
    prevCfg: OpenClawConfig
    nextCfg: OpenClawConfig
    accountId: string
    runtime: RuntimeEnv
  }) => Promise<void> | void

  // 账号被删除时调用
  onAccountRemoved?: (params: {...}) => Promise<void> | void
}
```

---

## 四、账号生命周期状态机

位置：`src/gateway/server-channels.ts`

### 4.1 ChannelManager — 账号生命周期管理器

```typescript
export type ChannelManager = {
  // 获取所有通道的运行快照
  getRuntimeSnapshot: () => ChannelRuntimeSnapshot

  // 启动所有已配置通道
  startChannels: () => Promise<void>

  // 按通道/账号启动
  startChannel: (channel: ChannelId, accountId?: string) => Promise<void>

  // 按通道/账号停止
  stopChannel: (channel: ChannelId, accountId?: string) => Promise<void>

  // 标记账号已登出
  markChannelLoggedOut: (channelId: ChannelId, cleared: boolean, accountId?: string) => void

  // 检查是否手动停止
  isManuallyStopped: (channelId: ChannelId, accountId: string) => boolean

  // 重置重启尝试计数
  resetRestartAttempts: (channelId: ChannelId, accountId: string) => void
}
```

### 4.2 账号状态流转详解

```
┌─────────────────────────────────────────────────────────────────┐
│                     账号生命周期状态机                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 配置账号                                                     │
│     config.listAccountIds(cfg) → 读取配置中所有账号              │
│     config.resolveAccount(cfg, id) → 解析每个账号                │
│                                                                  │
│  2. 检查是否启用                                                 │
│     config.isEnabled?(account, cfg) → boolean                   │
│     │ 未启用 → configured=true, running=false, lastError="disabled"│
│     │                                                          │
│  3. 检查是否已配置                                               │
│     config.isConfigured?(account, cfg) → boolean                │
│     │ 未配置 → configured=false, lastError="not configured"     │
│     │                                                          │
│  4. 启动账号（startChannelInternal）                            │
│     gateway.startAccount(ctx) → Promise                          │
│     │                                                          │
│     ├── running=true, lastStartAt=Date.now()                   │
│     │                                                          │
│     └── 启动失败 → lastError=message, 自动重试（最多 10 次）     │
│                      exponential backoff: 5s → 10s → 20s ...    │
│                                                                  │
│  5. 运行中                                                       │
│     - 收到消息 → 更新 lastInboundAt                             │
│     - 发送消息 → 更新 lastOutboundAt                            │
│     - 探活失败 → 触发自动重启                                    │
│                                                                  │
│  6. 手动停止（stopChannel）                                       │
│     - abort.abort() 取消长连接                                  │
│     - gateway.stopAccount(ctx) 清理资源                          │
│     - manuallyStopped.add(key) 标记手动停止，不自动重启           │
│                                                                  │
│  7. 登出（logoutAccount）                                        │
│     - 删除/清空 token                                            │
│     - markChannelLoggedOut() → running=false, lastError="logged out"│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 核心处理逻辑

**启动通道**（`startChannelInternal`）的核心流程：

```typescript
// src/gateway/server-channels.ts:235-392
async function startChannelInternal(channelId, accountId?, opts = {}) {
  const plugin = getChannelPlugin(channelId)
  const startAccount = plugin?.gateway?.startAccount
  if (!startAccount) return  // 没有 gateway 能力的插件跳过

  const cfg = loadConfig()
  const accountIds = accountId ? [accountId] : plugin.config.listAccountIds(cfg)

  // 并行启动所有账号
  await Promise.all(accountIds.map(async (id) => {
    const account = plugin.config.resolveAccount(cfg, id)

    // 检查是否启用
    const enabled = plugin.config.isEnabled ? plugin.config.isEnabled(account, cfg) : true
    if (!enabled) {
      setRuntime(channelId, id, { enabled: false, configured: true, lastError: "disabled" })
      return
    }

    // 检查是否已配置
    const configured = await plugin.config.isConfigured?.(account, cfg)
    if (!configured) {
      setRuntime(channelId, id, { enabled: true, configured: false, lastError: "not configured" })
      return
    }

    // 创建中止控制器
    const abort = new AbortController()
    store.aborts.set(id, abort)

    // 设置初始状态
    setRuntime(channelId, id, { running: true, lastStartAt: Date.now(), lastError: null })

    // 调用插件的 startAccount
    const task = startAccount({
      cfg, accountId: id, account, runtime, abortSignal: abort.signal, log, getStatus, setStatus
    })

    // 跟踪任务：失败时自动重启
    const trackedPromise = Promise.resolve(task)
      .catch((err) => { /* 记录错误 */ })
      .finally(() => { running = false, lastStopAt = Date.now() })
      .then(async () => {
        // 自动重启逻辑（最多 10 次）
        if (!manuallyStopped.has(rKey)) {
          const attempt = restartAttempts.get(rKey) ?? 0 + 1
          if (attempt <= MAX_RESTART_ATTEMPTS) {
            await sleepWithAbort(computeBackoff(policy, attempt), abort.signal)
            await startChannelInternal(channelId, id, { preserveRestartAttempts: true, preserveManualStop: true })
          }
        }
      })

    store.tasks.set(id, trackedPromise)
  }))
}
```

---

## 五、入站消息路由

位置：`src/routing/resolve-route.ts`

### 5.1 路由匹配流程

```typescript
// src/routing/resolve-route.ts:614-804
export function resolveAgentRoute(input: ResolveAgentRouteInput): ResolvedAgentRoute {
  // 输入维度：
  // - channel: "telegram"
  // - accountId: "default"
  // - peer: { kind: "group", id: "-1001234567890" }
  // - guildId: "123456"        (Discord 特有)
  // - teamId: "987654"         (Slack 特有)
  // - memberRoleIds: ["角色1"]  (Discord 特有)

  // 1. 获取该通道+账号的所有 bindings
  const bindings = getEvaluatedBindingsForChannelAccount(input.cfg, channel, accountId)

  // 2. 按优先级逐层匹配
  const tiers = [
    { matchedBy: "binding.peer",        ... },  // ← 最高优先级
    { matchedBy: "binding.peer.parent",  ... },  // 线程的父会话
    { matchedBy: "binding.guild+roles",  ... },  // Discord 角色绑定
    { matchedBy: "binding.guild",        ... },  // Discord 服务器
    { matchedBy: "binding.team",         ... },   // Slack Team
    { matchedBy: "binding.account",      ... },   // 账号级别绑定
    { matchedBy: "binding.channel",      ... },   // 通道默认绑定
  ]

  // 3. 找到匹配的 binding → 返回 agentId + sessionKey
  //    没匹配到 → 返回默认 agent
  return choose(resolveDefaultAgentId(input.cfg), "default")
}
```

### 5.2 sessionKey 的构建

```typescript
// src/routing/session-key.ts
buildAgentSessionKey({
  agentId: "my-agent",
  channel: "telegram",
  accountId: "default",
  peer: { kind: "group", id: "-1001234567890" }
})
// → "agent:my-agent|telegram:default|group:-1001234567890"
```

**关键设计**：sessionKey 是一级实体，同一个通道的同一个 agent 可以有多个独立会话（按 peer 隔离）。这使得"一个 agent 同时服务多个群/多个人"成为可能。

---

## 六、出站消息统一发送

位置：`src/infra/outbound/deliver.ts`

### 6.1 发送编排流程

```typescript
// src/infra/outbound/deliver.ts:479-773
export async function deliverOutboundPayloads(params): Promise<OutboundDeliveryResult[]> {
  // 1. 写入发送队列（持久化，防止丢消息）
  const queueId = await enqueueDelivery({ channel, to, payloads, ... })

  // 2. 获取通道处理器
  const handler = await createChannelHandler({ cfg, channel, to, accountId, ... })

  // 3. 遍历每个 payload 发送
  for (const payload of normalizedPayloads) {
    // 3a. 运行 message_sending 插件钩子（可能修改内容或取消）
    const hookResult = await applyMessageSendingHook({ ... })
    if (hookResult.cancelled) continue

    // 3b. 如果有 channelData/interactive → 走 sendPayload
    if (handler.sendPayload && hasChannelDataOrInteractive) {
      const delivery = await handler.sendPayload(effectivePayload, sendOverrides)
      results.push(delivery)
      continue
    }

    // 3c. 纯文本 → 切片后发送
    if (payloadSummary.mediaUrls.length === 0) {
      if (handler.sendFormattedText) {
        results.push(...await handler.sendFormattedText(text, sendOverrides))
      } else {
        await sendTextChunks(text, sendOverrides)  // chunker 切片
      }
      continue
    }

    // 3d. 有媒体 → 发送媒体（不支持则降级为纯文本）
    if (!handler.supportsMedia) {
      await sendTextChunks(fallbackText)
    } else {
      for (const url of payloadSummary.mediaUrls) {
        if (handler.sendFormattedMedia) {
          results.push(await handler.sendFormattedMedia(caption, url))
        } else {
          results.push(await handler.sendMedia(caption, url))
        }
      }
    }
  }

  // 4. 成功后从队列移除
  await ackDelivery(queueId)
  return results
}
```

### 6.2 切片策略

```typescript
// 切片发生在 sendTextChunks 中
if (handler.chunker && textLimit !== undefined) {
  const chunks = handler.chunker(text, textLimit)  // 调用通道特定的 chunker
  for (const chunk of chunks) {
    results.push(await handler.sendText(chunk, overrides))
  }
}
```

Telegram 的 chunker（`extensions/telegram/src/channel.ts:603`）：
```typescript
chunker: (text, limit) => getTelegramRuntime().channel.text.chunkMarkdownText(text, limit)
// Markdown 感知的切片，保留格式完整性
```

---

## 七、插件注册机制

位置：`src/plugins/registry.ts`

### 7.1 注册通道

```typescript
// src/plugins/registry.ts:461-520
const registerChannel = (record, registration, mode = "full") => {
  const plugin = registration.plugin

  // 检查 ID 唯一性
  const existingRuntime = registry.channels.find((entry) => entry.plugin.id === id)
  if (existingRuntime) {
    pushDiagnostic({ level: "error", message: `channel already registered: ${id}` })
    return
  }

  // 同时注册到 channelSetups（用于 setup 向导）
  registry.channelSetups.push({ pluginId, plugin, source, enabled, ... })

  // 完整模式下注册到 channels（运行时）
  if (mode !== "setup-only") {
    registry.channels.push({ pluginId, plugin, source, ... })
  }
}
```

### 7.2 插件入口示例

```typescript
// extensions/telegram/src/index.ts（推测结构）
register(api) {
  setTelegramRuntime(api.runtime)
  api.registerChannel({ plugin: telegramPlugin })
}
```

注册后，`registry.channels` 中就有了这个插件，网关启动时 `ChannelManager.startChannels()` 会遍历所有已注册通道并调用它们的 `startAccount`。

---

## 八、Telegram 插件完整实现对照

以 Telegram 为例，看一个完整生产级通道插件需要实现哪些能力：

```typescript
// extensions/telegram/src/channel.ts:378-901
export const telegramPlugin: ChannelPlugin<ResolvedTelegramAccount, TelegramProbe> = {
  id: "telegram",
  meta: { id: "telegram", label: "Telegram", ... },

  // 能力声明
  capabilities: {
    chatTypes: ["direct", "group", "channel", "thread"],
    reactions: true,
    threads: true,
    media: true,
    polls: true,
    nativeCommands: true,
    blockStreaming: true,
  },

  // 配置读写
  config: {
    listAccountIds,
    resolveAccount,
    isConfigured: (account, cfg) => {
      if (!account.token?.trim()) return false
      return !findTelegramTokenOwnerAccountId({ cfg, accountId: account.accountId })
    },
    describeAccount: (account, cfg) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim()),
      tokenSource: account.tokenSource,
    }),
    // ... 更多
  },

  // 账号白名单
  allowlist: {
    supportsScope: ({ scope }) => scope === "dm" || scope === "group",
    readConfig: ({ cfg, accountId }) => readTelegramAllowlistConfig(...),
    applyConfigEdit: buildAccountScopedAllowlistConfigEditor(...),
  },

  // 出站发送
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => chunkMarkdownText(text, limit),
    textChunkLimit: 4000,
    sendPayload: async ({ cfg, to, payload, ... }) => { ... },
    sendText: async ({ cfg, to, text, ... }) => { ... },
    sendMedia: async ({ cfg, to, text, mediaUrl, ... }) => { ... },
    sendPoll: async ({ cfg, to, poll, ... }) => { ... },
  },

  // 状态探测
  status: {
    defaultRuntime: { accountId: DEFAULT_ACCOUNT_ID, running: false, ... },
    probeAccount: async ({ account, timeoutMs }) => probeTelegram(...),
    formatCapabilitiesProbe: ({ probe }) => [...],  // 格式化显示
    auditAccount: async ({ account, timeoutMs, probe, cfg }) => auditGroupMembership(...),
    buildAccountSnapshot: ({ account, cfg, runtime, probe, audit }) => ({ ... }),
    collectStatusIssues: collectTelegramStatusIssues,
  },

  // 网关生命周期
  gateway: {
    startAccount: async (ctx) => { /* 启动长连接/webhook */ },
    logoutAccount: async ({ accountId, cfg }) => { /* 清空 token */ },
  },

  // 群组管理
  groups: {
    resolveRequireMention: resolveTelegramGroupRequireMention,
    resolveToolPolicy: resolveTelegramGroupToolPolicy,
  },

  // 安全策略
  security: {
    resolveDmPolicy: resolveTelegramDmPolicy,
    collectWarnings: ({ account, cfg }) => [...],
  },

  // 生命周期钩子
  lifecycle: {
    onAccountConfigChanged: async ({ prevCfg, nextCfg, accountId }) => { /* token 变了则清除 offset */ },
    onAccountRemoved: async ({ accountId }) => { /* 清理 offset */ },
  },

  // 消息操作（工具调用）
  actions: telegramMessageActions,

  // 设置向导
  setup: telegramSetupAdapter,
  setupWizard: telegramSetupWizard,

  // 目录（联系人列表）
  directory: {
    self: async () => null,
    listPeers: async (params) => listTelegramDirectoryPeersFromConfig(params),
    listGroups: async (params) => listTelegramDirectoryGroupsFromConfig(params),
  },

  // ACP 绑定
  acpBindings: {
    normalizeConfiguredBindingTarget: normalizeTelegramAcpConversationId,
    matchConfiguredBinding: matchTelegramAcpConversation,
  },
}
```

---

## 九、最小实现清单

如果你要实现一个类似的多通道架构，以下是**最小可行 MVP**（必须实现的核心接口）：

### 必需实现的 6 个最小点

| 优先级 | 接口 | 最小实现 |
|--------|------|---------|
| 1 | `ChannelPlugin.id/meta/capabilities` | 声明通道 ID 和能力 |
| 2 | `config.listAccountIds` | 返回配置中的账号列表 |
| 3 | `config.resolveAccount` | 根据 accountId 解析账号对象 |
| 4 | `gateway.startAccount` | 至少能拉起监听（长连接/webhook/polling） |
| 5 | `outbound.sendText` | 先只支持文本发送 |
| 6 | `status.probeAccount` | 先返回 `{ ok: true }` |

### 最小代码示例

```typescript
// my-channel.ts
const myChannelPlugin: ChannelPlugin = {
  id: "mychannel",
  meta: { id: "mychannel", label: "My Channel", ... },
  capabilities: { chatTypes: ["direct", "group"] },

  config: {
    listAccountIds: (cfg) => Object.keys(cfg.channels?.mychannel?.accounts ?? {}),
    resolveAccount: (cfg, accountId) => cfg.channels.mychannel.accounts[accountId ?? "default"],
  },

  gateway: {
    startAccount: async (ctx) => {
      // 启动长连接
      const client = new MyChannelClient({ token: ctx.account.token, ... })
      client.on("message", (msg) => {
        // 收到消息 → 路由到 agent
        ctx.channelRuntime?.reply.dispatchReply(...)
      })
      ctx.abortSignal.addEventListener("abort", () => client.disconnect())
      return client.connect()
    },
  },

  outbound: {
    deliveryMode: "direct",
    sendText: async ({ to, text }) => {
      await myChannelClient.sendMessage(to, text)
      return { channel: "mychannel", messageId: "xxx" }
    },
  },

  status: {
    probeAccount: async ({ account }) => {
      const ok = await myChannelClient.ping(account.token)
      return { ok }
    },
  },
}
```

---

## 十、易混淆点纠正

### 纠正 1: "通道插件"不是可有可无

**错误理解**：通道插件只是"多装一个包"。

**正确理解**：通道插件是**平台协议适配层**。没有它，核心系统无法与任何平台通信。它负责：
- 平台私有协议 → 统一接口
- 平台特有配置格式 → 标准化账号对象
- 平台发送限制（如 Telegram 4096 字符）→ 切片策略

### 纠正 2: "账号生命周期"不是概念词

**错误理解**：账号生命周期是"设计文档里的漂亮图表"。

**正确理解**：它是**真实的状态机**，代码路径在 `src/gateway/server-channels.ts`：

```
配置 → 启用检查 → 配置检查 → startAccount() → running=true
                                              ↓ 失败
                                        自动重试（指数退避）
                                              ↓ 手动停止
                                     manuallyStopped.add(key)
                                              ↓ 登出
                                    logoutAccount() → 清理 token
```

每个状态转换都有明确的代码处理，不是文档。

### 纠正 3: 核心网关不直接写 Telegram/Discord 细节

**错误理解**：OpenClaw 的核心代码里应该有 `if (channel === 'telegram') { ... }` 这样的平台特定代码。

**正确理解**：全部下沉到通道适配器。核心网关只调用接口：

```typescript
// src/gateway/server-channels.ts:314
const task = startAccount({
  cfg, accountId: id, account, runtime, abortSignal: abort.signal, log, getStatus, setStatus
})
// ↑ 没有 platform === 'telegram' 的判断
```

这就是**依赖反转**（DIP）：高层模块（网关）不依赖低层模块（平台 SDK），而是依赖抽象接口（ChannelGatewayAdapter）。

### 纠正 4: "出站"和"入站"是完全独立的路径

- **入站**：平台 → `gateway.startAccount` 里的事件监听 → 路由层 → agent
- **出站**：agent 回复 → `deliverOutboundPayloads` → `channel.outbound.sendText()` → 平台

两者通过 `ChannelOutboundContext` 共享配置，但调用链路完全分开。

---

## 十一、架构设计亮点（值得借鉴）

### 亮点 1: 账号是一级实体

```typescript
// 一个通道可以有多个账号，故障隔离
plugin.config.listAccountIds(cfg)  // → ["default", "bot1", "bot2"]
startChannel("telegram", "bot1")   // 只启动 bot1，不影响 bot2
```

### 亮点 2: 中止信号传递

```typescript
// 每个 startAccount 都接收 abortSignal
const task = startAccount({ abortSignal: abort.signal, ... })

// 插件内部监听 abort
ctx.abortSignal.addEventListener("abort", () => client.disconnect())
```

这使得**优雅关闭**成为可能：网关停止时，不会强制 kill，而是通知插件自行清理。

### 亮点 3: 自动重试 + 退避

```typescript
// 通道崩溃后自动重启，最多 10 次
const CHANNEL_RESTART_POLICY = {
  initialMs: 5_000,   // 5 秒
  maxMs: 5 * 60_000,   // 5 分钟上限
  factor: 2,           // 指数
  jitter: 0.1,         // 10% 随机抖动（防止惊群）
}
```

### 亮点 4: 路由匹配分层

```
peer 匹配（最精准）→ guild+roles → guild → team → account → channel → default
```

从精准到模糊，逐层降级。没有匹配到才用默认 agent。

### 亮点 5: 出站队列持久化

```typescript
// 发送前先入队，发送成功后 ack，失败后 fail
const queueId = await enqueueDelivery({ channel, to, payloads, ... })
// 即使进程崩溃，重启后队列会重试未 ack 的消息
```

---

## 十二、参考文件索引

| 文件 | 作用 |
|------|------|
| `src/channels/plugins/types.plugin.ts` | `ChannelPlugin` 主类型定义 |
| `src/channels/plugins/types.adapters.ts` | 所有适配器类型（Config/Gateway/Outbound/Status/Auth...） |
| `src/channels/plugins/types.core.ts` | 核心类型（`ChannelAccountSnapshot`、`ChannelMeta`、`ChannelCapabilities`） |
| `src/plugins/registry.ts` | `registerChannel()` 插件注册 |
| `src/gateway/server-channels.ts` | `createChannelManager()` 账号生命周期管理 |
| `src/routing/resolve-route.ts` | `resolveAgentRoute()` 入站路由 |
| `src/infra/outbound/deliver.ts` | `deliverOutboundPayloads()` 出站发送编排 |
| `extensions/telegram/src/channel.ts` | Telegram 完整实现（生产级参考） |
| `extensions/discord/src/channel.ts` | Discord 完整实现（生产级参考） |
