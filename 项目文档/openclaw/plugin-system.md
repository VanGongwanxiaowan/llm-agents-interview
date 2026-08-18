# OpenClaw 插件系统详解

> 本文档面向希望学习 agent 开发的读者，详细解析 OpenClaw 如何在不改核心代码的前提下扩展通道、工具、命令和网关能力。

---

## 目录

1. [整体架构概述](#1-整体架构概述)
2. [第一步：插件发现与加载 (`loader.ts`)](#2-第一步插件发现与加载-loaderts)
3. [第二步：能力注册中心 (`registry.ts`)](#3-第二步能力注册中心-registryts)
4. [第三步：运行时上下文 (`runtime/index.ts`)](#4-第三步运行时上下文-runtimeindexts)
5. [第四步：活跃注册表全局单例 (`runtime.ts`)](#5-第四步活跃注册表全局单例-runtimets)
6. [第五步：插件服务生命周期 (`services.ts`)](#6-第五步插件服务生命周期-servicests)
7. [第六步：网关整合点 (`server-plugins.ts` + `server.impl.ts`)](#7-第六步网关整合点-server-pluginsts--serverimplts)
8. [数据流总览](#8-数据流总览)
9. [设计亮点与经验总结](#9-设计亮点与经验总结)

---

## 1. 整体架构概述

OpenClaw 插件系统的核心设计思想是：**在不修改核心代码的情况下，通过插件扩展系统的任何能力**。

### 1.1 插件可以注册的能力

| 能力类型 | 说明 |
|---------|------|
| **tools** | Agent 可调用的工具 |
| **hooks** | 生命周期钩子（before_agent_start 等） |
| **channels** | 消息通道（Telegram、Discord 等） |
| **providers** | 模型提供商 |
| **gateway methods** | 网关 RPC 方法 |
| **HTTP routes** | HTTP 路由 |
| **CLI commands** | CLI 命令 |
| **services** | 后台服务（start/stop） |

### 1.2 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│  网关 / CLI / 通道层                                         │
│  (gateway/server.impl.ts, CLI commands, channel adapters)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  活跃注册表（全局单例）                                        │
│  runtime.ts: setActivePluginRegistry / getActivePluginRegistry │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  插件注册中心（能力总线）                                      │
│  registry.ts: createPluginRegistry                           │
│  ├─ tools[]                                                │
│  ├─ hooks[]                                                 │
│  ├─ channels[]                                              │
│  ├─ providers[]                                             │
│  ├─ gatewayHandlers{}                                       │
│  ├─ httpRoutes[]                                            │
│  ├─ cliRegistrars[]                                         │
│  ├─ services[]                                              │
│  └─ commands[]                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  运行时上下文（安全工具箱）                                    │
│  runtime/index.ts: createPluginRuntime                       │
│  ├─ config (只读配置访问)                                    │
│  ├─ tools (工具工厂)                                         │
│  ├─ channel (通道操作)                                       │
│  ├─ subagent (子 agent 运行)                                 │
│  ├─ media (媒体处理)                                         │
│  └─ modelAuth (模型认证，限制了范围)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  插件代码（用户编写的扩展）                                    │
│  extensions/*: index.ts                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 第一步：插件发现与加载 (`loader.ts`)

**文件位置**: `src/plugins/loader.ts`

这是整个插件系统的入口，负责：**发现 → 验证 → 加载 → 注册**的完整流程。

### 2.1 插件来源优先级

```typescript
// 优先级从高到低
const PLUGIN_ORIGINS = [
  "config",    // 用户在配置中明确指定的路径
  "global",    // 全局安装的插件（~/.openclaw/extensions）
  "bundled",   // 捆绑插件（npm 包）
  "workspace", // 工作区插件（./extensions）
];
```

**关键设计**：用户配置的路径优先级最高，确保用户始终有最终控制权。

### 2.2 重复插件的优先级决策

当多个来源提供同一个插件 ID 时：

```typescript
function resolveCandidateDuplicateRank(params: {
  candidate: PluginCandidate;
  ...
}): number {
  if (params.candidate.origin === "config") return 0;  // 最高
  if (params.candidate.origin === "global" && isExplicitInstall) return 1;
  if (params.candidate.origin === "bundled") return 2;
  if (params.candidate.origin === "workspace") return 3;
  return 4;  // 最低
}
```

### 2.3 路径安全检查

**关键安全机制**：防止插件访问禁区目录。

```typescript
function checkSourceEscapesRoot(params: {
  source: string;
  rootDir: string;
}): CandidateBlockIssue | null {
  const sourceRealPath = safeRealpathSync(params.source);
  const rootRealPath = safeRealpathSync(params.rootDir);
  if (isPathInside(rootRealPath, sourceRealPath)) {
    return null;  // 安全
  }
  return { reason: "source_escapes_root", ... };  // 阻止
}
```

**三种阻止条件**：
1. **source_escapes_root**: 插件源码试图跳出其根目录
2. **path_world_writable**: 路径对所有人可写（可能被恶意利用）
3. **path_suspicious_ownership**: 路径所有者不是当前用户且不是 root

### 2.4 Jiti 动态加载

```typescript
const jitiLoader = createJiti(import.meta.url, {
  interopDefault: true,
  extensions: [".ts", ".tsx", ".mts", ".js", ".mjs", ".json"],
  alias: {
    "openclaw/plugin-sdk": resolvedPluginSdkPath,
    "openclaw/extension-api": resolvedExtensionApiPath,
  },
});

// 加载插件模块
const mod = jitiLoader(safeSource) as OpenClawPluginModule;
```

**Jiti 的作用**：在运行时将 TypeScript/ESM 模块动态加载为 JavaScript，无需预先编译。

### 2.5 插件配置验证

```typescript
const validatedConfig = validatePluginConfig({
  schema: manifestRecord.configSchema,
  cacheKey: manifestRecord.schemaCacheKey,
  value: entry?.config,  // 用户配置的插件配置
});

if (!validatedConfig.ok) {
  // 配置无效，插件加载失败
  pushPluginLoadError(`invalid config: ${validatedConfig.errors?.join(", ")}`);
}
```

### 2.6 插件缓存机制

```typescript
const registryCache = new Map<string, PluginRegistry>();
const MAX_PLUGIN_REGISTRY_CACHE_ENTRIES = 10;

function setCachedPluginRegistry(cacheKey: string, registry: PluginRegistry): void {
  // LRU 驱逐策略
  while (registryCache.size > MAX_PLUGIN_REGISTRY_CACHE_ENTRIES) {
    const oldestKey = registryCache.keys().next().value;
    registryCache.delete(oldestKey);
  }
  registryCache.set(cacheKey, registry);
}
```

**缓存 key 的构成**：

```typescript
function buildCacheKey(params: {
  workspaceDir?: string;
  plugins: NormalizedPluginsConfig;
  installs?: Record<string, PluginInstallRecord>;
  env: NodeJS.ProcessEnv;
  onlyPluginIds?: string[];
  includeSetupOnlyChannelPlugins?: boolean;
}): string {
  // 包含：工作区、全局扩展、捆绑扩展、插件配置、安装记录等
}
```

### 2.7 懒加载运行时

```typescript
let resolvedRuntime: PluginRuntime | null = null;
const resolveRuntime = (): PluginRuntime => {
  resolvedRuntime ??= resolveCreatePluginRuntime()(options.runtimeOptions);
  return resolvedRuntime;
};

// 使用 Proxy 实现懒加载
const runtime = new Proxy({} as PluginRuntime, {
  get(_target, prop, receiver) {
    return Reflect.get(resolveRuntime(), prop, receiver);
  },
});
```

**为什么用 Proxy？**：避免在插件发现阶段就加载所有 channel/runtime 依赖树，只有真正需要时才加载。

---

## 3. 第二步：能力注册中心 (`registry.ts`)

**文件位置**: `src/plugins/registry.ts`

这是整个系统的"能力总线"，所有插件通过它注册自己的能力。

### 3.1 注册表数据结构

```typescript
export type PluginRegistry = {
  plugins: PluginRecord[];              // 所有发现的插件
  tools: PluginToolRegistration[];      // 注册的工具
  hooks: PluginHookRegistration[];      // 注册的钩子
  typedHooks: TypedPluginHookRegistration[];
  channels: PluginChannelRegistration[]; // 通道插件
  channelSetups: PluginChannelSetupRegistration[];
  providers: PluginProviderRegistration[]; // 模型提供商
  webSearchProviders: PluginWebSearchProviderRegistration[];
  gatewayHandlers: GatewayRequestHandlers; // 网关方法
  httpRoutes: PluginHttpRouteRegistration[]; // HTTP 路由
  cliRegistrars: PluginCliRegistration[]; // CLI 注册器
  services: PluginServiceRegistration[];  // 后台服务
  commands: PluginCommandRegistration[];  // 命令
  diagnostics: PluginDiagnostic[];        // 诊断信息
};
```

### 3.2 冲突检测

**每个注册方法都会检查冲突**：

```typescript
const registerGatewayMethod = (record: PluginRecord, method: string, handler) => {
  const trimmed = method.trim();
  if (coreGatewayMethods.has(trimmed) || registry.gatewayHandlers[trimmed]) {
    pushDiagnostic({
      level: "error",
      message: `gateway method already registered: ${trimmed}`,
    });
    return;  // 拒绝注册
  }
  registry.gatewayHandlers[trimmed] = handler;
};

const registerHttpRoute = (record: PluginRecord, params) => {
  // 检查路由冲突
  const overlappingRoute = findOverlappingPluginHttpRoute(registry.httpRoutes, {
    path: normalizedPath,
    match,
  });
  if (overlappingRoute && overlappingRoute.auth !== params.auth) {
    pushDiagnostic({
      level: "error",
      message: `http route overlap rejected: ...`,
    });
    return;
  }
};
```

### 3.3 注册模式

```typescript
type PluginRegistrationMode =
  | "full"        // 完全注册（所有能力）
  | "setup-only"  // 仅注册通道设置
  | "setup-runtime"; // 在 setup 运行时注册
```

**为什么区分？**：

```typescript
const shouldLoadChannelPluginInSetupRuntime = ({
  manifestChannels,
  setupSource,
  cfg,
  env,
}:): boolean => {
  // 如果通道已经在配置中启用，不需要 setup 运行时注册
  return !manifestChannels.some((channelId) =>
    isChannelConfigured(cfg, channelId, env)
  );
};
```

### 3.4 Prompt Injection 防护

```typescript
const constrainLegacyPromptInjectionHook = (
  handler: PluginHookHandlerMap["before_agent_start"],
): PluginHookHandlerMap["before_agent_start"] => {
  return (event, ctx) => {
    const result = handler(event, ctx);
    // 过滤掉 prompt mutation 字段，防止注入攻击
    return stripPromptMutationFieldsFromLegacyHookResult(result);
  };
};

// 当插件配置 allowPromptInjection=false 时
if (policy?.allowPromptInjection === false && isPromptInjectionHookName(hookName)) {
  if (hookName === "before_agent_start") {
    effectiveHandler = constrainLegacyPromptInjectionHook(handler);
  }
  if (hookName === "before_prompt_build") {
    return;  // 直接阻止
  }
}
```

### 3.5 API 对象工厂

```typescript
const createApi = (record: PluginRecord, params: {...}): OpenClawPluginApi => {
  return {
    id: record.id,
    name: record.name,
    runtime: registryParams.runtime,  // 注入运行时
    logger: normalizeLogger(registryParams.logger),
    registerTool: (tool, opts) => registerTool(record, tool, opts),
    registerHook: (events, handler, opts) => registerHook(...),
    registerHttpRoute: (params) => registerHttpRoute(record, params),
    registerChannel: (registration) => registerChannel(record, registration),
    // ... 其他注册方法
  };
};
```

**关键点**：插件拿到的 `api` 对象是受限的，只能执行注册操作，不能直接访问核心内部。

---

## 4. 第三步：运行时上下文 (`runtime/index.ts`)

**文件位置**: `src/plugins/runtime/index.ts`

这是插件的"安全可控工具箱"，统一提供各种能力给插件。

### 4.1 运行时组成

```typescript
export function createPluginRuntime(_options: CreatePluginRuntimeOptions = {}): PluginRuntime {
  return {
    version: resolveVersion(),           // OpenClaw 版本
    config: createRuntimeConfig(),       // 配置访问
    subagent: _options.subagent ?? createUnavailableSubagentRuntime(),
    system: createRuntimeSystem(),        // 系统信息
    media: createRuntimeMedia(),         // 媒体处理
    tts: { textToSpeechTelephony },      // 语音合成
    stt: { transcribeAudioFile },        // 语音转写
    tools: createRuntimeTools(),         // 工具工厂
    channel: createRuntimeChannel(),    // 通道操作
    events: createRuntimeEvents(),       // 事件系统
    logging: createRuntimeLogging(),     // 日志
    state: { resolveStateDir },          // 状态目录
    modelAuth: {                         // 模型认证（受限）
      getApiKeyForModel: (params) =>
        getApiKeyForModelRaw({
          model: params.model,
          cfg: params.cfg,
          // 注意：agentDir、profileId 被 strip
        }),
    },
  };
}
```

### 4.2 安全边界设计

**最重要的安全设计**：插件无法指定 `agentDir` 或 `profileId`，防止跨 agent 访问凭据。

```typescript
modelAuth: {
  getApiKeyForModel: (params) =>
    getApiKeyForModelRaw({
      model: params.model,
      cfg: params.cfg,
      // agentDir / store: stripped (防止读其他 agent 的 store)
      // profileId / preferredProfile: stripped (防止通过 profile 导航凭据)
      // 插件只指定 provider/model，核心 auth 管道自动选择合适凭据
    }),
},
```

### 4.3 Subagent 运行时

```typescript
function createGatewaySubagentRuntime(): PluginRuntime["subagent"] {
  return {
    async run(params) {
      // 通过网关 RPC 调用 agent
      const payload = await dispatchGatewayMethod("agent", {
        sessionKey: params.sessionKey,
        message: params.message,
        ...
      });
      return { runId: payload.runId };
    },
    async waitForRun(params) {
      const payload = await dispatchGatewayMethod("agent.wait", {
        runId: params.runId,
        timeoutMs: params.timeoutMs,
      });
      return { status: payload.status, ... };
    },
    getSessionMessages: async (params) => {...},
    deleteSession: async (params) => {...},
  };
}
```

**为什么通过 RPC？**：插件运行在独立上下文，通过网关 RPC 保证隔离。

---

## 5. 第四步：活跃注册表全局单例 (`runtime.ts`)

**文件位置**: `src/plugins/runtime.ts`

### 5.1 全局状态管理

```typescript
const REGISTRY_STATE = Symbol.for("openclaw.pluginRegistryState");

type RegistryState = {
  registry: PluginRegistry | null;
  httpRouteRegistry: PluginRegistry | null;
  httpRouteRegistryPinned: boolean;  // HTTP 路由可被"钉住"
  key: string | null;                 // 缓存 key
  version: number;                   // 版本号（递增）
};

const state: RegistryState = (() => {
  const globalState = globalThis as typeof globalThis & {
    [REGISTRY_STATE]?: RegistryState;
  };
  if (!globalState[REGISTRY_STATE]) {
    globalState[REGISTRY_STATE] = {
      registry: createEmptyPluginRegistry(),
      httpRouteRegistry: null,
      httpRouteRegistryPinned: false,
      key: null,
      version: 0,
    };
  }
  return globalState[REGISTRY_STATE];
})();
```

**使用 `globalThis` 而非模块变量**：确保在多个模块实例间共享状态（SSR/微服务场景）。

### 5.2 HTTP 路由钉住机制

```typescript
// 网关启动时钉住
export function pinActivePluginHttpRouteRegistry(registry: PluginRegistry) {
  state.httpRouteRegistry = registry;
  state.httpRouteRegistryPinned = true;
}

// 释放钉住
export function releasePinnedPluginHttpRouteRegistry(registry?: PluginRegistry) {
  if (registry && state.httpRouteRegistry !== registry) {
    return;
  }
  state.httpRouteRegistryPinned = false;
  state.httpRouteRegistry = state.registry;
}
```

**为什么需要钉住？**：某些情况下（如热重载），HTTP 路由需要保持稳定，不能随主注册表切换。

### 5.3 版本追踪

```typescript
export function getActivePluginRegistryVersion(): number {
  return state.version;
}

// 每次 setActivePluginRegistry 都递增
state.version += 1;
```

**用途**：观察者模式，让依赖方知道注册表已更新。

---

## 6. 第五步：插件服务生命周期 (`services.ts`)

**文件位置**: `src/plugins/services.ts`

### 6.1 服务接口

```typescript
export type OpenClawPluginService = {
  id: string;  // 唯一标识
  start: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
  stop?: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
};
```

### 6.2 启动与停止

```typescript
export async function startPluginServices(params: {
  registry: PluginRegistry;
  config: OpenClawConfig;
  workspaceDir?: string;
}): Promise<PluginServicesHandle> {
  const running: Array<{
    id: string;
    stop?: () => void | Promise<void>;
  }> = [];

  for (const entry of params.registry.services) {
    try {
      await entry.service.start(serviceContext);
      running.push({
        id: service.id,
        stop: service.stop ? () => service.stop?.(serviceContext) : undefined,
      });
    } catch (err) {
      // 启动失败不影响其他服务
      log.error(`plugin service failed (${service.id}): ${error}`);
    }
  }

  return {
    stop: async () => {
      // 逆序停止（后启动的先停止）
      for (const entry of running.toReversed()) {
        try {
          await entry.stop?.();
        } catch (err) {
          log.warn(`plugin service stop failed (${entry.id}): ${String(err)}`);
        }
      }
    },
  };
}
```

**设计要点**：
1. **启动失败不影响其他服务**：容错设计
2. **逆序停止**：后启动的先停止，避免依赖问题
3. **停止失败只警告**：避免级联失败

---

## 7. 第六步：网关整合点 (`server-plugins.ts` + `server.impl.ts`)

### 7.1 网关插件加载入口

**文件位置**: `src/gateway/server-plugins.ts`

```typescript
export function loadGatewayPlugins(params: {
  cfg: ReturnType<typeof loadConfig>;
  workspaceDir: string;
  log: { info, warn, error, debug };
  coreGatewayHandlers: Record<string, GatewayRequestHandler>;
  baseMethods: string[];
}) {
  const pluginRegistry = loadOpenClawPlugins({
    config: params.cfg,
    workspaceDir: params.workspaceDir,
    logger: params.log,
    coreGatewayHandlers: params.coreGatewayHandlers,
    runtimeOptions: {
      subagent: createGatewaySubagentRuntime(),  // 注入 subagent 运行时
    },
  });

  // 合并核心方法与插件方法
  const pluginMethods = Object.keys(pluginRegistry.gatewayHandlers);
  const gatewayMethods = Array.from(new Set([...params.baseMethods, ...pluginMethods]));

  // 记录诊断信息
  for (const diag of pluginRegistry.diagnostics) {
    if (diag.level === "error") {
      params.log.error(`[plugins] ${diag.message}`);
    } else {
      params.log.info(`[plugins] ${diag.message}`);
    }
  }

  return { pluginRegistry, gatewayMethods };
}
```

### 7.2 Fallback 网关上下文

**问题**：WebSocket 路径通过 AsyncLocalStorage 设置请求作用域，但通道适配器（如 Telegram 轮询）直接调用 agent，没有经过 WebSocket。

```typescript
const FALLBACK_GATEWAY_CONTEXT_STATE_KEY: unique symbol = Symbol.for(
  "openclaw.fallbackGatewayContextState",
);

// 网关启动时设置 fallback
export function setFallbackGatewayContext(ctx: GatewayRequestContext): void {
  fallbackGatewayContextState.context = ctx;
}

// 插件需要网关上下文时使用
async function dispatchGatewayMethod<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const scope = getPluginRuntimeGatewayRequestScope();
  const context = scope?.context ?? fallbackGatewayContextState.context;
  // ...
}
```

### 7.3 服务启动顺序

**文件位置**: `src/gateway/server.impl.ts`

```typescript
// 网关启动时
const { pluginRegistry } = loadGatewayPlugins({...});

// 启动插件服务
const { stop: stopPluginServices } = await startPluginServices({
  registry: pluginRegistry,
  config: cfg,
  workspaceDir: workspaceDir,
});

// 网关关闭时
await stopPluginServices();
```

---

## 8. 数据流总览

```
┌─────────────────────────────────────────────────────────────────┐
│  1. 网关/CLI 启动                                                │
│     loadGatewayPlugins() 被调用                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. 插件发现 (discovery.ts)                                      │
│     discoverOpenClawPlugins()                                    │
│     ├─ 扫描 config/loadPaths                                     │
│     ├─ 扫描 workspace/extensions                                 │
│     ├─ 扫描 bundled 插件                                          │
│     ├─ 扫描 global 插件                                           │
│     └─ 路径安全检查（跳出根目录、世界可写、所有权）                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. 插件验证 (loader.ts)                                        │
│     ├─ 检查 allowlist/denylist                                   │
│     ├─ 检查 manifest schema                                       │
│     ├─ 配置验证（JSON Schema）                                    │
│     └─ 重复 ID 优先级决策                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. 插件加载 (loader.ts)                                         │
│     ├─ 用 jiti 动态加载 .ts/.mjs                                 │
│     ├─ 执行插件的 register(api) 函数                              │
│     └─ 注册能力到 registry                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. 注册表创建 (registry.ts)                                      │
│     createPluginRegistry()                                       │
│     ├─ 冲突检测（gateway methods, http routes, channels 等）        │
│     ├─ Prompt injection 防护                                       │
│     └─ 创建受限的 api 对象                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. 运行时创建 (runtime/index.ts)                                 │
│     createPluginRuntime()                                        │
│     ├─ config: 只读配置访问                                       │
│     ├─ subagent: 通过网关 RPC 运行 agent                          │
│     ├─ tools: 工具工厂                                            │
│     ├─ channel: 通道操作                                          │
│     ├─ modelAuth: 受限的认证访问（无 agentDir/profileId）           │
│     └─ media/stt/tts: 媒体处理                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. 激活注册表 (runtime.ts)                                       │
│     setActivePluginRegistry(registry, cacheKey)                  │
│     ├─ 设置全局单例状态                                            │
│     ├─ 初始化全局 hook runner                                     │
│     └─ version++                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  8. 服务启动 (services.ts)                                        │
│     startPluginServices()                                        │
│     ├─ 遍历 registry.services                                      │
│     ├─ 调用 service.start(ctx)                                    │
│     └─ 注册停止处理器                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  9. 网关运行中                                                   │
│     ├─ 插件通过 runtime 执行能力                                   │
│     ├─ 通道通过 registry.channels 收发消息                          │
│     ├─ 工具通过 registry.tools 被 agent 调用                       │
│     ├─ Hooks 通过 hook runner 在生命周期点触发                     │
│     └─ HTTP routes 通过 registry.httpRoutes 处理                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  10. 网关关闭                                                     │
│     stopPluginServices()                                         │
│     ├─ 逆序停止所有服务                                            │
│     └─ 释放资源                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. 设计亮点与经验总结

### 9.1 安全性设计

| 实践 | 具体做法 |
|------|----------|
| **路径隔离** | 插件源码不能跳出其根目录 |
| **权限检查** | 世界可写的路径被阻止加载 |
| **所有权验证** | 非 root 的其他用户拥有的路径被阻止 |
| **凭据隔离** | `modelAuth` 限制了 agentDir/profileId，插件无法跨 agent 访问凭据 |
| **Prompt injection 防护** | `allowPromptInjection=false` 时阻止或过滤 prompt mutation hooks |
| **边界文件读取** | `openBoundaryFileSync` 防止符号链接攻击 |
| **配置验证** | JSON Schema 验证插件配置 |

### 9.2 可扩展性设计

| 实践 | 具体做法 |
|------|----------|
| **能力总线** | 统一的注册中心，任何能力都通过 registry 注册 |
| **注册模式** | `full`/`setup-only`/`setup-runtime` 适应不同场景 |
| **懒加载** | 用 Proxy 懒加载 runtime，避免过早加载依赖 |
| **Jiti 动态加载** | 支持 TypeScript/ESM 插件，无需预编译 |
| **多来源优先级** | config > global > bundled > workspace |

### 9.3 健壮性设计

| 实践 | 具体做法 |
|------|----------|
| **容错启动** | 单个服务启动失败不影响其他服务 |
| **逆序停止** | 后启动先停止，避免依赖问题 |
| **缓存 + LRU** | 注册表缓存限制条目数，防止内存泄漏 |
| **诊断信息** | 所有错误/警告记录到 diagnostics，不中断流程 |
| **Snapshot 加载** | 非激活加载用于验证，不污染全局状态 |

### 9.4 缓存失效策略

```typescript
// 发现缓存：1秒 TTL，burst 请求合并
const DEFAULT_DISCOVERY_CACHE_MS = 1000;

// 注册表缓存：LRU 驱逐
const MAX_PLUGIN_REGISTRY_CACHE_ENTRIES = 10;

// 显式失效
export function clearPluginDiscoveryCache(): void {
  discoveryCache.clear();
}
```

### 9.5 配置灵活性

```typescript
// 插件配置示例
{
  "plugins": {
    "enabled": true,
    "allow": ["my-plugin"],      // 白名单（安全）
    "deny": [],                  // 黑名单
    "loadPaths": ["./my-plugins"],
    "slots": {
      "memory": "custom-memory"  // 槽位填充
    },
    "entries": {
      "my-plugin": {
        "enabled": true,
        "config": { ... },
        "hooks": {
          "allowPromptInjection": false
        }
      }
    }
  }
}
```

### 9.6 关键设计哲学

1. **插件是客人，不是主人**：插件只能注册能力，不能直接调用核心内部
2. **安全第一**：所有外部输入都经过验证
3. **容错优先**：单个插件失败不影响整个系统
4. **用户控制**：配置路径优先级最高
5. **最小暴露**：运行时只暴露必要的能力

---

## 附录：关键文件索引

| 文件 | 职责 |
|------|------|
| `src/plugins/loader.ts` | 插件发现、验证、加载、缓存 |
| `src/plugins/discovery.ts` | 文件系统扫描、路径安全检查 |
| `src/plugins/registry.ts` | 能力注册中心、冲突检测 |
| `src/plugins/runtime/index.ts` | 安全运行时上下文 |
| `src/plugins/runtime.ts` | 全局单例状态管理 |
| `src/plugins/services.ts` | 服务生命周期管理 |
| `src/plugins/config-state.ts` | 插件配置规范化 |
| `src/plugins/commands.ts` | 插件命令注册 |
| `src/plugins/types.ts` | 插件类型定义 |
| `src/gateway/server-plugins.ts` | 网关插件加载入口 |
| `src/gateway/server.impl.ts` | 网关启动整合 |
