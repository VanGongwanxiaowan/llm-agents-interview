# Gateway 运行时编排详解

> 本文档通过 OpenClaw 项目源码，详细解析网关（Gateway）是如何一次性把配置、插件、通道、WebSocket/HTTP、定时器、热重载等组件编排起来的。通过学习这个设计，你可以掌握构建复杂 agent 系统时的架构经验和模块化思路。

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [主入口：`startGatewayServer` 启动序列](#2-主入口startgatewayserver-启动序列)
3. [步骤详解](#3-步骤详解)
   - [步骤 1-2：配置读取与迁移](#步骤-1-2-配置读取与迁移)
   - [步骤 3：自动启用插件](#步骤-3-自动启用插件)
   - [步骤 4：加载插件注册表](#步骤-4-加载插件注册表)
   - [步骤 5：解析运行时配置](#步骤-5-解析运行时配置)
   - [步骤 6：创建网关运行时状态](#步骤-6-创建网关运行时状态)
   - [步骤 7：节点注册表](#步骤-7-节点注册表)
   - [步骤 8：通道管理器](#步骤-8-通道管理器)
   - [步骤 9：服务发现](#步骤-9-服务发现)
   - [步骤 10：WebSocket 处理器绑定](#步骤-10-websocket-处理器绑定)
   - [步骤 11：心跳与维护定时器](#步骤-11-心跳与维护定时器)
   - [步骤 12：定时任务服务](#步骤-12-定时任务服务)
   - [步骤 13：启动 Sidecars](#步骤-13-启动-sidecars)
   - [步骤 14：配置热重载](#步骤-14-配置热重载)
   - [步骤 15：创建关闭句柄](#步骤-15-创建关闭句柄)
4. [关闭流程解析](#4-关闭流程解析)
5. [设计亮点总结](#5-设计亮点总结)

---

## 1. 整体架构概览

OpenClaw Gateway 是一个**编排引擎**，它的核心职责是：

```
                    ┌─────────────────────────────────────┐
                    │         startGatewayServer          │
                    │        (主入口, server.impl.ts)      │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
   │   配置层     │         │   插件层     │         │   通道层     │
   │ Config/Auth │         │  Plugins    │         │  Channels   │
   └─────────────┘         └─────────────┘         └─────────────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                    ┌──────────────┴──────────────────────┐
                    │         运行时状态 (Runtime State)   │
                    │  HTTP Server + WebSocket Server      │
                    │  Broadcast + Clients + ChatRunState  │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
   │  定时任务    │         │  服务发现    │         │  热重载     │
   │    Cron     │         │  Discovery  │         │   Reload   │
   └─────────────┘         └─────────────┘         └─────────────┘
```

**核心设计思想**：
- **先加载后启动**：插件加载在核心状态创建之前，确保所有扩展能力先注册
- **共享状态上下文**：所有组件通过一个大的 `gatewayRequestContext` 共享状态
- **分层关停**：关闭时按依赖顺序反向关停，避免资源泄漏

---

## 2. 主入口：`startGatewayServer` 启动序列

**源码位置**：`src/gateway/server.impl.ts:274-1098`

```typescript
export async function startGatewayServer(
  port = 18789,
  opts: GatewayServerOptions = {},
): Promise<GatewayServer> {
  // 1. 读取配置快照
  // 2. 迁移旧配置
  // 3. 自动启用插件
  // 4. 加载插件注册表
  // 5. 解析运行时配置
  // 6. 创建网关运行时状态
  // 7. 节点注册表
  // 8. 通道管理器
  // 9. 服务发现
  // 10. WebSocket 处理器绑定
  // 11. 心跳/健康检查定时器
  // 12. 定时任务服务
  // 13. Sidecars 启动
  // 14. 配置热重载
  // 15. 返回关闭句柄
}
```

---

## 3. 步骤详解

### 步骤 1-2：配置读取与迁移

**相关源码**：`server.impl.ts:292-325`

```typescript
// 第一次读取配置快照
let configSnapshot = await readConfigFileSnapshot();

// 检查是否有旧版本配置项需要迁移
if (configSnapshot.legacyIssues.length > 0) {
  if (isNixMode) {
    throw new Error("Legacy config entries detected while running in Nix mode...");
  }
  // 尝试自动迁移旧配置
  const { config: migrated, changes } = migrateLegacyConfig(configSnapshot.parsed);
  if (migrated) {
    await writeConfigFile(migrated);
    log.info(`gateway: migrated legacy config entries:\n${changes.map(...).join('\n')}`);
  }
}

// 再次读取（迁移后）
configSnapshot = await readConfigFileSnapshot();

// 校验配置合法性
if (configSnapshot.exists && !configSnapshot.valid) {
  throw new Error(`Invalid config at ${configSnapshot.path}...\n${issues}`);
}
```

**处理细节**：

1. **Legacy 迁移**：如果用户使用的是旧版配置格式，系统会自动尝试迁移到新格式
2. **Fail-Fast 原则**：如果配置无效，直接抛出错误，不让网关在"半坏配置"下启动
3. **Nix 模式特殊处理**：在 Nix 环境下不允许静默迁移，强制要求用户更新配置

---

### 步骤 3：自动启用插件

**相关源码**：`server.impl.ts:327-339`

```typescript
// 根据规则自动启用符合条件的插件
const autoEnable = applyPluginAutoEnable({ config: configSnapshot.config, env: process.env });
if (autoEnable.changes.length > 0) {
  try {
    await writeConfigFile(autoEnable.config);
    log.info(`gateway: auto-enabled plugins:\n${autoEnable.changes.map(...).join('\n')}`);
  } catch (err) {
    log.warn(`gateway: failed to persist plugin auto-enable changes: ${String(err)}`);
  }
}
```

**处理细节**：
- 系统会根据环境变量或配置规则**自动启用**某些插件
- 插件变更会被**持久化**到配置文件
- 失败不会阻止启动，只记录警告

---

### 步骤 4：加载插件注册表

**相关源码**：`server-plugins.ts:164-211`

```typescript
export function loadGatewayPlugins(params: {
  cfg: ReturnType<typeof loadConfig>;
  workspaceDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void; ... };
  coreGatewayHandlers: Record<string, GatewayRequestHandler>;
  baseMethods: string[];
}) {
  // 1. 加载所有已注册的插件
  const pluginRegistry = loadOpenClawPlugins({
    config: params.cfg,
    workspaceDir: params.workspaceDir,
    logger: params.log,
    coreGatewayHandlers: params.coreGatewayHandlers,
    runtimeOptions: {
      subagent: createGatewaySubagentRuntime(),  // 注入子 agent 运行时
    },
  });

  // 2. 收集所有插件暴露的 gateway methods
  const pluginMethods = Object.keys(pluginRegistry.gatewayHandlers);
  const gatewayMethods = Array.from(new Set([...params.baseMethods, ...pluginMethods]));

  // 3. 记录插件诊断信息
  if (pluginRegistry.diagnostics.length > 0) {
    for (const diag of pluginRegistry.diagnostics) {
      // 分类记录 error/info
    }
  }

  return { pluginRegistry, gatewayMethods };
}
```

**处理细节**：

1. **插件加载时机**：在核心状态创建**之前**完成，因为插件可能注册：
   - Gateway methods（方法处理器）
   - HTTP 路由
   - 通道适配器
   - Hooks

2. **子 Agent 运行时**：为每个插件注入了 `subagent` runtime，使其能够：
   ```typescript
   // 插件可以调用这些方法
   subagent.run({ sessionKey, message, ... })
   subagent.waitForRun({ runId, timeoutMs })
   subagent.getSession({ sessionKey })
   ```

3. **方法合并**：核心方法 + 插件方法合并到同一分发层

---

### 步骤 5：解析运行时配置

**相关源码**：`server-runtime-config.ts:40-188`

```typescript
export async function resolveGatewayRuntimeConfig(params: {
  cfg: ReturnType<typeof loadConfig>;
  port: number;
  bind?: GatewayBindMode;
  host?: string;
  controlUiEnabled?: boolean;
  // ...其他选项
}): Promise<GatewayRuntimeConfig> {
  // 1. 解析 bind 模式 (loopback/lan/tailnet/auto)
  const bindMode = params.bind ?? params.cfg.gateway?.bind ?? "loopback";
  const bindHost = params.host ?? (await resolveGatewayBindHost(bindMode, customBindHost));

  // 2. 控制 UI 配置
  const controlUiEnabled = params.controlUiEnabled ?? params.cfg.gateway?.controlUi?.enabled ?? true;

  // 3. OpenAI 兼容接口配置
  const openAiChatCompletionsEnabled = ...

  // 4. Tailscale 配置
  const tailscaleConfig = mergeGatewayTailscaleConfig(tailscaleBase, tailscaleOverrides);
  const tailscaleMode = tailscaleConfig.mode ?? "off";

  // 5. 认证配置解析
  const resolvedAuth = resolveGatewayAuth({
    authConfig: params.cfg.gateway?.auth,
    authOverride: params.auth,
    env: process.env,
    tailscaleMode,
  });

  // 6. 安全校验
  assertGatewayAuthConfigured(resolvedAuth, params.cfg.gateway?.auth);

  // 7. Tailscale + Funnel 特殊校验
  if (tailscaleMode === "funnel" && authMode !== "password") {
    throw new Error("tailscale funnel requires gateway auth mode=password");
  }

  // 8. 非 loopback 绑定必须有认证
  if (!isLoopbackHost(bindHost) && !hasSharedSecret && authMode !== "trusted-proxy") {
    throw new Error(`refusing to bind gateway to ${bindHost} without auth`);
  }

  return { bindHost, controlUiEnabled, resolvedAuth, tailscaleConfig, ... };
}
```

**处理细节**：

1. **Bind 模式解析**：
   - `loopback`：127.0.0.1（默认，最安全）
   - `lan`：0.0.0.0（局域网可访问）
   - `tailnet`：仅 Tailscale IP
   - `auto`：优先 loopback，否则 LAN

2. **多层安全校验**：
   - Funnel 模式强制要求密码认证
   - 非本地绑定必须配置认证
   - 跨域请求需要明确的 origin 列表

---

### 步骤 6：创建网关运行时状态

**相关源码**：`server-runtime-state.ts:48-253`

这是**最核心**的步骤，创建了网关的所有共享状态：

```typescript
export async function createGatewayRuntimeState(params): Promise<{
  canvasHost: CanvasHostHandler | null;
  httpServer: HttpServer;
  httpServers: HttpServer[];
  wss: WebSocketServer;
  clients: Set<GatewayWsClient>;
  broadcast: GatewayBroadcastFn;
  broadcastToConnIds: GatewayBroadcastToConnIdsFn;
  agentRunSeq: Map<string, number>;
  dedupe: Map<string, DedupeEntry>;
  chatRunState: ReturnType<typeof createChatRunState>;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
  toolEventRecipients: ReturnType<typeof createToolEventRecipientRegistry>;
  // ...
}> {
  // 1. 为插件 HTTP 路由注册表加锁
  pinActivePluginHttpRouteRegistry(params.pluginRegistry);

  // 2. 创建 Canvas Host（如果启用）
  if (params.canvasHostEnabled) {
    const handler = await createCanvasHostHandler({ ... });
    canvasHost = handler;
  }

  // 3. 创建客户端集合和广播器
  const clients = new Set<GatewayWsClient>();
  const { broadcast, broadcastToConnIds } = createGatewayBroadcaster({ clients });

  // 4. 创建 HTTP 服务器
  for (const host of bindHosts) {
    const httpServer = createGatewayHttpServer({ ... });
    await listenGatewayHttpServer({ httpServer, bindHost: host, port: params.port });
    httpServers.push(httpServer);
  }

  // 5. 创建 WebSocket Server
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PREAUTH_PAYLOAD_BYTES });

  // 6. 为每个 HTTP Server 附加 upgrade 处理器
  for (const server of httpServers) {
    attachGatewayUpgradeHandler({ httpServer: server, wss, ... });
  }

  // 7. 创建运行时状态 Map
  const agentRunSeq = new Map<string, number>();        // agent 运行序号
  const dedupe = new Map<string, DedupeEntry>();         // 去重缓存
  const chatRunState = createChatRunState();            // 聊天运行状态
  const chatAbortControllers = new Map();                // 中止控制器
  const toolEventRecipients = createToolEventRecipientRegistry();

  return { ... };
}
```

**处理细节**：

1. **插件路由注册表锁**：
   - 使用 `pinActivePluginHttpRouteRegistry` 锁定当前插件路由
   - 确保热重载时路由变更安全

2. **多地址绑定**：
   - 可能绑定多个 host（loopback + LAN IP）
   - 每个地址一个 `httpServer`

3. **WebSocket Server 配置**：
   - `noServer: true`：手动处理 upgrade
   - `maxPayload`：限制 preauth 负载大小

4. **广播机制**：
   ```typescript
   // 广播函数签名
   broadcast(event: string, payload: unknown, opts?: { dropIfSlow?: boolean })
   ```

---

### 步骤 7：节点注册表

**相关源码**：`node-registry.ts:38-209`

```typescript
export class NodeRegistry {
  private nodesById = new Map<string, NodeSession>();
  private nodesByConn = new Map<string, string>();
  private pendingInvokes = new Map<string, PendingInvoke>();

  // 注册新节点
  register(client: GatewayWsClient, opts: { remoteIp?: string }) {
    const nodeId = connect.device?.id ?? connect.client.id;
    const session: NodeSession = {
      nodeId,
      connId: client.connId,
      client,
      caps: [...],           // 节点能力
      commands: [...],       // 支持的命令
      permissions: {...},    // 权限
      connectedAtMs: Date.now(),
    };
    this.nodesById.set(nodeId, session);
    this.nodesByConn.set(client.connId, nodeId);
    return session;
  }

  // 注销节点
  unregister(connId: string): string | null {
    // 清理注册信息
    // 取消所有待处理的 invoke
  }

  // RPC 调用节点
  async invoke(params: {
    nodeId: string;
    command: string;
    params?: unknown;
    timeoutMs?: number;
  }): Promise<NodeInvokeResult> {
    // 发送调用请求
    // 设置超时计时器
    // 返回 Promise 直到收到结果或超时
  }

  // 处理调用结果
  handleInvokeResult(params: { id, nodeId, ok, payload, error }): boolean {
    // 找到对应的 pending invoke
    // 调用 resolve/reject
  }
}
```

**处理细节**：
- **节点**指的是连接到网关的移动端或其他客户端
- **RPC 机制**：支持请求-响应模式的跨进程调用
- **超时控制**：默认 30 秒超时
- **断开处理**：节点断开时自动清理所有待处理的 invoke

---

### 步骤 8：通道管理器

**相关源码**：`server-channels.ts:135-545`

```typescript
export function createChannelManager(opts: ChannelManagerOptions): ChannelManager {
  const channelStores = new Map<ChannelId, ChannelRuntimeStore>();
  const restartAttempts = new Map<string, number>();
  const manuallyStopped = new Set<string>();

  const startChannelInternal = async (channelId: ChannelId, accountId?: string) => {
    const plugin = getChannelPlugin(channelId);
    const startAccount = plugin?.gateway?.startAccount;
    if (!startAccount) return;

    // 检查是否已启动
    if (store.tasks.has(id)) return;

    // 检查账号是否启用
    const enabled = plugin.config.isEnabled ? plugin.config.isEnabled(account, cfg) : true;
    if (!enabled) { /* 设置 disabled 状态 */ }

    // 检查是否已配置
    if (plugin.config.isConfigured) {
      configured = await plugin.config.isConfigured(account, cfg);
    }
    if (!configured) { /* 设置 unconfigured 状态 */ }

    // 创建中止控制器
    const abort = new AbortController();

    // 调用通道的启动函数
    const task = startAccount({
      cfg, accountId, account,
      runtime: channelRuntimeEnvs[channelId],
      abortSignal: abort.signal,
      log,
      getStatus, setStatus,
      ...(resolvedChannelRuntime && { channelRuntime: resolvedChannelRuntime })
    });

    // 跟踪任务
    store.tasks.set(id, trackedPromise);

    // 错误处理：自动重启
    trackedPromise.catch((err) => {
      // 计算重启延迟
      const delayMs = computeBackoff(CHANNEL_RESTART_POLICY, attempt);
      // 设置重启状态
      setRuntime(channelId, id, { restartPending: true, ... });
      // 等待后重启
      await sleepWithAbort(delayMs, abort.signal);
      await startChannelInternal(channelId, id, { preserveRestartAttempts: true });
    });
  };

  return {
    getRuntimeSnapshot,
    startChannels,      // 启动所有通道
    startChannel,       // 启动单个通道
    stopChannel,        // 停止通道
    markChannelLoggedOut,
    isManuallyStopped,
    resetRestartAttempts,
    isHealthMonitorEnabled,
  };
}
```

**处理细节**：

1. **通道生命周期**：
   - 通道有自己的启动/停止/重启逻辑
   - 支持多账号（channelId:accountId）

2. **重启策略**：
   ```typescript
   const CHANNEL_RESTART_POLICY: BackoffPolicy = {
     initialMs: 5_000,   // 初始 5 秒
     maxMs: 5 * 60_000,  // 最大 5 分钟
     factor: 2,           // 指数退避
     jitter: 0.1,        // 10% 抖动
   };
   const MAX_RESTART_ATTEMPTS = 10;  // 最多重试 10 次
   ```

3. **手动停止标记**：
   - 用户手动停止的通道不会被自动重启
   - 使用 `manuallyStopped` Set 跟踪

4. **健康监控**：
   - 每个通道可独立配置健康检查
   - 检查间隔：`channelHealthCheckMinutes`

---

### 步骤 9：服务发现

**相关源码**：`server-discovery-runtime.ts:10-100`

```typescript
export async function startGatewayDiscovery(params) {
  let bonjourStop: (() => Promise<void>) | null = null;
  const mdnsMode = params.mdnsMode ?? "minimal";

  // mDNS/Bonjour 发现（可配置关闭）
  const bonjourEnabled =
    mdnsMode !== "off" &&
    process.env.OPENCLAW_DISABLE_BONJOUR !== "1" &&
    process.env.NODE_ENV !== "test" &&
    !process.env.VITEST;

  if (bonjourEnabled) {
    const bonjour = await startGatewayBonjourAdvertiser({
      instanceName: formatBonjourInstanceName(params.machineDisplayName),
      gatewayPort: params.port,
      gatewayTlsEnabled: params.gatewayTls?.enabled ?? false,
      // ...
    });
    bonjourStop = bonjour.stop;
  }

  // 广域网 DNS-SD 发现
  if (params.wideAreaDiscoveryEnabled) {
    const wideAreaDomain = resolveWideAreaDiscoveryDomain({ ... });
    const tailnetIPv4 = pickPrimaryTailnetIPv4();
    const result = await writeWideAreaGatewayZone({
      domain: wideAreaDomain,
      gatewayPort: params.port,
      displayName: formatBonjourInstanceName(params.machineDisplayName),
      tailnetIPv4,
      // ...
    });
  }

  return { bonjourStop };
}
```

**处理细节**：

1. **mDNS/Bonjour**：
   - 用于局域网内的自动发现
   - 可配置为 `minimal`（仅基本信息）或 `full`（完整信息）
   - 测试/开发环境自动禁用

2. **广域网 DNS-SD**：
   - 通过 DNS 记录发布网关信息
   - 支持 Tailscale 集成

---

### 步骤 10：WebSocket 处理器绑定

**相关源码**：`server-ws-runtime.ts:24-44`

```typescript
export function attachGatewayWsHandlers(params: GatewayWsRuntimeParams) {
  attachGatewayWsConnectionHandler({
    wss: params.wss,
    clients: params.clients,
    port: params.port,
    gatewayHost: params.gatewayHost,
    canvasHostEnabled: params.canvasHostEnabled,
    canvasHostServerPort: params.canvasHostServerPort,
    resolvedAuth: params.resolvedAuth,
    rateLimiter: params.rateLimiter,
    browserRateLimiter: params.browserRateLimiter,
    gatewayMethods: params.gatewayMethods,
    events: params.events,
    logGateway: params.logGateway,
    logHealth: params.logHealth,
    logWsControl: params.logWsControl,
    extraHandlers: params.extraHandlers,  // 插件处理器
    broadcast: params.broadcast,
    buildRequestContext: () => params.context,
  });
}
```

**处理细节**：
- **方法分发层**：核心方法 + 插件方法在同一个 WS 处理器中
- **认证与限流**：每个连接需要通过认证，支持 rate limiting
- **请求上下文**：通过 `buildRequestContext` 工厂函数构建

---

### 步骤 11：心跳与维护定时器

**相关源码**：`server-maintenance.ts:15-164`

```typescript
export function startGatewayMaintenanceTimers(params) {
  // 1. 设置健康广播更新回调
  setBroadcastHealthUpdate((snap: HealthSummary) => {
    params.broadcast("health", snap, { ... });
    params.nodeSendToAllSubscribed("health", snap);
  });

  // 2. tick 定时器（心跳）
  const tickInterval = setInterval(() => {
    const payload = { ts: Date.now() };
    params.broadcast("tick", payload, { dropIfSlow: true });
    params.nodeSendToAllSubscribed("tick", payload);
  }, TICK_INTERVAL_MS);  // 15 秒

  // 3. 健康状态刷新定时器
  const healthInterval = setInterval(() => {
    void params.refreshGatewayHealthSnapshot({ probe: true });
  }, HEALTH_REFRESH_INTERVAL_MS);  // 30 秒

  // 4. 去重缓存清理
  const dedupeCleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of params.dedupe) {
      if (now - v.ts > DEDUPE_TTL_MS) {
        params.dedupe.delete(k);
      }
    }
    // 超出容量限制，删除最老的条目
    if (params.dedupe.size > DEDUPE_MAX) { ... }
  }, 60_000);  // 1 分钟

  // 5. 超时中止控制器清理
  for (const [runId, entry] of params.chatAbortControllers) {
    if (now > entry.expiresAtMs) {
      abortChatRunById({ ... }, { runId, stopReason: "timeout" });
    }
  }

  // 6. 媒体文件清理（可选）
  if (typeof params.mediaCleanupTtlMs === "number") {
    const mediaCleanup = setInterval(() => {
      void cleanOldMedia(params.mediaCleanupTtlMs, { recursive: true, pruneEmptyDirs: true });
    }, 60 * 60_000);  // 1 小时
  }

  return { tickInterval, healthInterval, dedupeCleanup, mediaCleanup };
}
```

**处理细节**：

1. **Tick 广播**：
   - 每 15 秒发送一次心跳
   - 用于保持连接活跃

2. **健康状态**：
   - 每 30 秒刷新健康缓存
   - 首次启动时会立即刷新一次

3. **去重机制**：
   - Dedupe TTL：60 秒
   - 最大条数：50,000

4. **中止运行清理**：
   - 跟踪超时的 chat runs
   - 60 分钟后自动清理

---

### 步骤 12：定时任务服务

**相关源码**：`server-cron.ts:144-512`

```typescript
export function buildGatewayCronService(params): GatewayCronState {
  const cronLogger = getChildLogger({ module: "cron" });
  const storePath = resolveCronStorePath(params.cfg.cron?.store);
  const cronEnabled = process.env.OPENCLAW_SKIP_CRON !== "1" && params.cfg.cron?.enabled !== false;

  const cron = new CronService({
    storePath,
    cronEnabled,
    cronConfig: params.cfg.cron,
    defaultAgentId,

    // 运行孤立 agent job
    runIsolatedAgentJob: async ({ job, message, abortSignal }) => {
      return await runCronIsolatedAgentTurn({
        cfg: runtimeConfig,
        job,
        message,
        abortSignal,
        agentId,
        sessionKey: `cron:${job.id}`,
        lane: "cron",
      });
    },

    // 失败通知
    sendCronFailureAlert: async ({ job, text, channel, to, mode, accountId }) => {
      if (mode === "webhook") {
        // 发送 webhook
      } else if (mode === "announce") {
        // 通过通道发送通知
        await deliverOutboundPayloads({ ... });
      }
    },

    // 事件回调
    onEvent: (evt) => {
      params.broadcast("cron", evt, { dropIfSlow: true });
      if (evt.action === "finished") {
        // 记录运行日志
        // 发送 webhook（如果配置）
        // 处理失败告警
      }
    },
  });

  return { cron, storePath, cronEnabled };
}
```

**处理细节**：

1. **Cron 服务**：独立的任务调度系统
   - 支持 cron 表达式
   - 持久化存储（storePath）

2. **运行模式**：
   - `agentTurn`：在隔离环境中运行 agent
   - `webhook`：调用外部 webhook
   - `message`：发送消息到通道

3. **失败处理**：
   - Webhook 通知
   - 通道消息通知
   - 运行日志记录

---

### 步骤 13：启动 Sidecars

**相关源码**：`server-startup.ts:34-191`

```typescript
export async function startGatewaySidecars(params) {
  // 1. 清理过期的 session lock 文件
  const sessionDirs = await resolveAgentSessionDirs(stateDir);
  for (const sessionsDir of sessionDirs) {
    await cleanStaleLockFiles({ sessionsDir, staleMs: SESSION_LOCK_STALE_MS });
  }

  // 2. 启动浏览器控制服务器
  let browserControl = await startBrowserControlServerIfEnabled();

  // 3. 启动 Gmail watcher（如果配置）
  await startGmailWatcherWithLogs({ cfg: params.cfg, log: params.logHooks });

  // 4. 加载内部 hooks
  const loadedCount = await loadInternalHooks(params.cfg, params.defaultWorkspaceDir);

  // 5. 启动所有通道
  if (!skipChannels) {
    await params.startChannels();
  }

  // 6. 触发 gateway:startup 内部 hook
  if (params.cfg.hooks?.internal?.enabled) {
    setTimeout(() => {
      triggerInternalHook(createInternalHookEvent("gateway", "startup", ...));
    }, 250);
  }

  // 7. 启动插件服务
  const pluginServices = await startPluginServices({
    registry: params.pluginRegistry,
    config: params.cfg,
    workspaceDir: params.defaultWorkspaceDir,
  });

  // 8. ACP 身份调和（如果启用）
  if (params.cfg.acp?.enabled) {
    void getAcpSessionManager().reconcilePendingSessionIdentities({ cfg: params.cfg });
  }

  return { browserControl, pluginServices };
}
```

**处理细节**：

1. **Sidecars（边车服务）**：
   - 浏览器控制
   - 通道启动
   - Gmail 监听
   - 插件服务

2. **启动顺序**：
   - 先清理资源
   - 再启动主服务
   - 最后触发钩子

3. **通道启动**：
   - 独立于主网关进程
   - 支持 `OPENCLAW_SKIP_CHANNELS` 环境变量跳过

---

### 步骤 14：配置热重载

**相关源码**：`config-reload.ts:72-247`

```typescript
export function startGatewayConfigReloader(opts) {
  let currentConfig = opts.initialConfig;
  let settings = resolveGatewayReloadSettings(currentConfig);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // 文件监听器
  const watcher = chokidar.watch(opts.watchPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  watcher.on("add", schedule);
  watcher.on("change", schedule);
  watcher.on("unlink", schedule);

  const schedule = () => {
    scheduleAfter(settings.debounceMs);  // 默认 300ms 防抖
  };

  const applySnapshot = async (nextConfig) => {
    const changedPaths = diffConfigPaths(currentConfig, nextConfig);
    currentConfig = nextConfig;
    settings = resolveGatewayReloadSettings(nextConfig);

    const plan = buildGatewayReloadPlan(changedPaths);

    if (settings.mode === "off") {
      // 完全禁用热重载
      return;
    }

    if (settings.mode === "restart" || plan.restartGateway) {
      // 需要重启网关
      queueRestart(plan, nextConfig);
      return;
    }

    // 热更新
    await opts.onHotReload(plan, nextConfig);
  };

  return { stop: async () => { ... } };
}
```

**处理细节**：

1. **热重载模式**：
   - `off`：完全禁用
   - `hot`：只做热更新，需要重启的跳过
   - `restart`：需要重启时触发重启
   - `hybrid`（默认）：热更新可热更新的，需要重启的触发重启

2. **防抖机制**：
   - 300ms 防抖，避免配置频繁变更
   - 文件变更后等待 200ms 稳定再触发

3. **变更检测**：
   ```typescript
   diffConfigPaths(prev, next)  // 递归比较配置差异
   buildGatewayReloadPlan(changedPaths)  // 生成重载计划
   ```

---

### 步骤 15：创建关闭句柄

**相关源码**：`server-close.ts:9-147`

```typescript
export function createGatewayCloseHandler(params) {
  return async (opts?: { reason?: string; restartExpectedMs?: number | null }) => {
    try {
      // 1. 停止 mDNS/Bonjour
      if (params.bonjourStop) {
        await params.bonjourStop();
      }

      // 2. 停止 Tailscale
      if (params.tailscaleCleanup) {
        await params.tailscaleCleanup();
      }

      // 3. 关闭 Canvas Host
      if (params.canvasHost) {
        await params.canvasHost.close();
      }

      // 4. 停止所有通道
      for (const plugin of listChannelPlugins()) {
        await params.stopChannel(plugin.id);
      }

      // 5. 停止插件服务
      if (params.pluginServices) {
        await params.pluginServices.stop();
      }

      // 6. 停止 Gmail watcher
      await stopGmailWatcher();

      // 7. 停止 Cron 服务
      params.cron.stop();

      // 8. 停止心跳 runner
      params.heartbeatRunner.stop();

      // 9. 清理定时器
      clearInterval(params.tickInterval);
      clearInterval(params.healthInterval);
      clearInterval(params.dedupeCleanup);
      if (params.mediaCleanup) clearInterval(params.mediaCleanup);

      // 10. 广播关闭事件
      params.broadcast("shutdown", { reason, restartExpectedMs });

      // 11. 关闭所有客户端连接
      for (const c of params.clients) {
        c.socket.close(1012, "service restart");
      }
      params.clients.clear();

      // 12. 停止配置重载器
      await params.configReloader.stop();

      // 13. 停止浏览器控制
      if (params.browserControl) {
        await params.browserControl.stop();
      }

      // 14. 关闭 WebSocket Server
      await new Promise<void>((resolve) => params.wss.close(() => resolve()));

      // 15. 关闭 HTTP Servers
      for (const server of servers) {
        if (typeof httpServer.closeIdleConnections === "function") {
          httpServer.closeIdleConnections();
        }
        await new Promise<void>((resolve, reject) =>
          httpServer.close((err) => (err ? reject(err) : resolve()))
        );
      }
    } finally {
      // 16. 释放插件路由注册表
      params.releasePluginRouteRegistry?.();
    }
  };
}
```

---

## 4. 关闭流程解析

**整体关闭流程**（`server.impl.ts:1076-1097`）：

```typescript
return {
  close: async (opts) => {
    // 第一步：运行 gateway_stop 插件钩子
    await runGlobalGatewayStopSafely({
      event: { reason: opts?.reason ?? "gateway stopping" },
      ctx: { port },
      onError: (err) => log.warn(`gateway_stop hook failed: ${String(err)}`),
    });

    // 第二步：停止诊断心跳
    if (diagnosticsEnabled) {
      stopDiagnosticHeartbeat();
    }

    // 第三步：清理 skills 监听
    if (skillsRefreshTimer) {
      clearTimeout(skillsRefreshTimer);
    }
    skillsChangeUnsub();

    // 第四步：释放限流器
    authRateLimiter?.dispose();
    browserAuthRateLimiter.dispose();

    // 第五步：停止通道健康监控
    channelHealthMonitor?.stop();

    // 第六步：清除 secrets 快照
    clearSecretsRuntimeSnapshot();

    // 第七步：执行实际关闭
    await close(opts);
  },
};
```

**关闭顺序设计原则**：

1. **先外部后内部**：先停止插件/通道，再关闭核心服务
2. **广播通知**：在关闭连接前广播 shutdown 事件
3. **资源释放**：确保所有定时器、连接、监听器被正确清理
4. **错误隔离**：使用 try/finally 确保资源释放

---

## 5. 设计亮点总结

### 5.1 模块化编排

```
┌─────────────────────────────────────────────────────┐
│                   startGatewayServer                │
│                   (总导演/编排器)                     │
├─────────────────────────────────────────────────────┤
│  配置层  │  插件层  │  通道层  │  HTTP/WS  │  定时器  │
│   ↓       ↓        ↓         ↓          ↓         │
│  迁移    注册     启动      绑定       启动        │
│  校验    注入     生命周期   处理器    调度        │
├─────────────────────────────────────────────────────┤
│              createGatewayRuntimeState              │
│              (共享状态/上下文)                       │
├─────────────────────────────────────────────────────┤
│  广播  │  节点注册表  │  通道管理器  │  定时器      │
└─────────────────────────────────────────────────────┘
```

### 5.2 关键设计模式

| 模式 | 位置 | 说明 |
|------|------|------|
| **依赖注入** | `server-runtime-state.ts` | 通过参数注入所有依赖，便于测试 |
| **工厂函数** | `createGatewayRuntimeState` | 返回大对象作为共享上下文 |
| **AsyncLocalStorage** | `server-methods.ts` | 为每个请求创建独立上下文 |
| **事件驱动** | `broadcast` 函数 | 所有组件通过事件通信 |
| **退避策略** | `server-channels.ts` | 指数退避 + 抖动防止惊群 |
| **防抖** | `config-reload.ts` | 避免频繁触发重载 |

### 5.3 资源管理

1. **限流器**：`authRateLimiter` 在关闭时调用 `dispose()`
2. **定时器**：所有 `setInterval` 在关闭时都有对应的 `clearInterval`
3. **连接池**：HTTP Server 关闭前调用 `closeIdleConnections()`
4. **注册表锁**：插件路由注册表使用 `pin`/`release` 配对

### 5.4 安全考量

1. **Fail-Fast**：配置无效时直接抛出错误
2. **认证强制**：非本地绑定必须配置认证
3. **Origin 检查**：Control UI 需要明确的 allowed origins
4. **SSRF 防护**：Cron webhook 使用 SSRfGuard
5. **Rate Limiting**：认证尝试有次数限制

---

## 参考文件索引

| 文件 | 职责 |
|------|------|
| `src/gateway/server.impl.ts` | 主入口，编排所有组件 |
| `src/gateway/server-runtime-config.ts` | 解析运行时配置 |
| `src/gateway/server-runtime-state.ts` | 创建共享运行时状态 |
| `src/gateway/server-plugins.ts` | 加载插件注册表 |
| `src/gateway/server-channels.ts` | 通道生命周期管理 |
| `src/gateway/server-ws-runtime.ts` | WebSocket 处理器绑定 |
| `src/gateway/server-cron.ts` | 定时任务服务 |
| `src/gateway/server-maintenance.ts` | 心跳与维护定时器 |
| `src/gateway/server-discovery-runtime.ts` | 服务发现 |
| `src/gateway/config-reload.ts` | 配置热重载 |
| `src/gateway/server-close.ts` | 关闭处理器 |
| `src/gateway/node-registry.ts` | 节点注册表 |

---

*文档生成日期：2026-04-28*
*对应源码版本：main 分支*
