# 06_Gateway核心

## 1. Gateway 是什么？

**Gateway（网关）** 是 OpenClaw 的核心进程和控制平面：

```
┌────────────────────────────────────────────────────────────┐
│                        Gateway                              │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Channel   │  │   Plugin   │  │    Agent    │         │
│  │   Manager   │  │   Manager   │  │   Manager   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    Session  │  │   Config    │  │    Hook     │         │
│  │   Manager   │  │   Manager   │  │   Runner    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │              WebSocket / HTTP Server             │       │
│  │              (控制面板接口)                       │       │
│  └─────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────┘
```

**核心职责**：
- 管理所有 Agent 的生命周期
- 处理消息路由（Channel → Agent → Channel）
- 提供控制面板 API（WebSocket/HTTP）
- 协调插件系统

---

## 2. Gateway 启动流程

### 2.1 启动入口

```typescript
// src/gateway/server.impl.ts
export async function startGatewayServer(
  config: OpenClawConfig,
  options: GatewayServerOptions
): Promise<GatewayServer> {
  // 1. 初始化日志系统
  const log = createSubsystemLogger("gateway");

  // 2. 加载配置
  const runtimeConfig = loadRuntimeConfig(config);

  // 3. 初始化插件系统
  await loadPlugins(runtimeConfig);

  // 4. 初始化 Channel
  await startChannels(runtimeConfig);

  // 5. 启动 HTTP/WebSocket 服务器
  const server = await startHttpServer(runtimeConfig);

  // 6. 启动后台任务（cron、health check）
  await startBackgroundTasks(server);

  return server;
}
```

### 2.2 关键组件初始化顺序

```
1. 配置加载 (Config)
       │
       ▼
2. 日志系统 (Logging)
       │
       ▼
3. 秘密管理 (Secrets)
       │
       ▼
4. 插件系统 (Plugins)
       │
       ▼
5. 渠道系统 (Channels)
       │
       ▼
6. Agent 运行时 (Agent Runtime)
       │
       ▼
7. HTTP 服务器 (Server)
       │
       ▼
8. 后台任务 (Background Tasks)
```

---

## 3. Gateway 服务器架构

### 3.1 HTTP 接口

```typescript
// Gateway HTTP 处理
interface GatewayHttpHandlers {
  // 健康检查
  GET /health

  // 配置 API
  GET /config
  PUT /config

  // Session 管理
  GET /sessions
  POST /sessions/:id/send

  // 插件管理
  GET /plugins
  POST /plugins/:id/enable

  // 渠道状态
  GET /channels/:id/status
}
```

### 3.2 WebSocket 接口

```typescript
// Gateway WebSocket 事件
interface GatewayEvents {
  // 实时消息
  "message" → { sessionId, content }

  // Session 事件
  "session:start" → { sessionId }
  "session:end" → { sessionId }

  // Agent 事件
  "agent:thinking" → { sessionId, thinking }
  "agent:tool" → { sessionId, tool, params }

  // 状态更新
  "channel:status" → { channelId, status }
}
```

### 3.3 控制面板

```
┌─────────────────────────────────────────┐
│           Gateway 控制面板              │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Sessions   │  │  Channels   │      │
│  │  - list     │  │  - telegram │      │
│  │  - send     │  │  - discord  │      │
│  └─────────────┘  └─────────────┘      │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │   Plugins   │  │   Agents    │      │
│  │  - enabled  │  │  - running  │      │
│  │  - config   │  │  - paused   │      │
│  └─────────────┘  └─────────────┘      │
│                                         │
└─────────────────────────────────────────┘
```

---

## 4. Session 管理

### 4.1 Session 生命周期

```typescript
// src/gateway/session-lifecycle-state.ts
interface SessionLifecycle {
  // 创建
  async create(params: CreateSessionParams): Promise<Session>;

  // 恢复
  async resume(sessionId: string): Promise<Session>;

  // 重置
  async reset(sessionId: string, options?: ResetOptions): Promise<void>;

  // 归档
  async archive(sessionId: string): Promise<void>;

  // 删除
  async delete(sessionId: string): Promise<void>;
}
```

### 4.2 Session 存储

```typescript
// Session 存储位置
// ~/.openclaw/sessions/<session-id>/

interface SessionStore {
  // 消息历史
  messages: Message[];

  // 元数据
  meta: SessionMeta;

  // 状态
  state: SessionState;

  // 附件
  attachments: Attachment[];
}
```

---

## 5. 插件运行时 (Plugin Runtime)

### 5.1 插件加载

```typescript
// src/plugins/runtime.ts
export async function loadPlugin(pluginId: string): Promise<PluginRuntime> {
  // 1. 读取 manifest
  const manifest = await readPluginManifest(pluginId);

  // 2. 验证配置
  validatePluginConfig(pluginId, manifest.configSchema);

  // 3. 加载代码
  const code = await import(pluginId);

  // 4. 创建运行时
  const runtime = await code.createPlugin();

  return runtime;
}
```

### 5.2 插件生命周期

```
安装 (Install)
    │
    ▼
注册 (Register)
    │
    ▼
激活 (Activate)
    │
    ▼
运行 (Running)
    │         │
    ▼         ▼
  更新      禁用
    │         │
    └────┬────┘
         ▼
    卸载 (Uninstall)
```

---

## 6. 配置管理 (Config Management)

### 6.1 配置加载

```typescript
// src/config/io.ts
export async function loadConfig(): Promise<OpenClawConfig> {
  // 1. 读取配置文件 (yaml/json)
  const fileConfig = await readConfigFile();

  // 2. 合并环境变量覆盖
  const envConfig = loadEnvOverrides();

  // 3. 应用默认值
  const config = applyDefaults(merge(fileConfig, envConfig));

  // 4. 验证 schema
  validateConfig(config);

  return config;
}
```

### 6.2 配置热重载

```typescript
// 配置变更监听
registerConfigWriteListener(async (newConfig) => {
  // 通知所有组件配置已变更
  await reloadPlugins(newConfig);
  await reloadChannels(newConfig);
  await reloadAgents(newConfig);
});
```

---

## 7. 秘密管理 (Secrets)

### 7.1 秘密存储

```typescript
// src/secrets/runtime.ts
export interface SecretsRuntime {
  // 获取秘密
  get(key: string): string | undefined;

  // 设置秘密
  set(key: string, value: string): void;

  // 删除秘密
  delete(key: string): void;

  // 列出所有秘密
  list(): string[];
}
```

### 7.2 秘密引用

```yaml
# 配置中使用秘密引用
channels:
  telegram:
    botToken: ${TELEGRAM_BOT_TOKEN}  # 引用环境变量
```

---

## 8. Hook 运行器 (Hook Runner)

### 8.1 全局 Hook 注册

```typescript
// src/plugins/hook-runner-global.ts
export function getGlobalHookRunner(): HookRunner | undefined {
  return globalHookRunner;
}

export function setGlobalHookRunner(runner: HookRunner): void {
  globalHookRunner = runner;
}
```

### 8.2 Hook 执行

```typescript
// Hook 执行流程
async function runHook(
  hookName: string,
  event: PluginHookEvent,
  context: HookContext
): Promise<HookResult> {
  const handlers = getHookHandlers(hookName);

  for (const handler of handlers) {
    try {
      const result = await handler(event, context);
      if (result?.blocked) {
        return result;  // 被阻止，跳过后续 handler
      }
    } catch (error) {
      logError(`Hook ${hookName} failed:`, error);
    }
  }

  return { allowed: true };
}
```

---

## 9. 后台任务 (Background Tasks)

### 9.1 Cron 调度

```typescript
// src/cron/
export interface CronJob {
  id: string;
  schedule: string;  // cron 表达式
  handler: () => Promise<void>;
  enabled: boolean;
}

// 管理 Cron 任务
export class CronScheduler {
  async addJob(job: CronJob): Promise<void>;
  async removeJob(jobId: string): Promise<void>;
  async pauseJob(jobId: string): Promise<void>;
  async resumeJob(jobId: string): Promise<void>;
}
```

### 9.2 健康检查

```typescript
// src/gateway/server/health-state.ts
export interface HealthState {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  memory: { used: number; total: number };
  channels: Map<string, ChannelHealth>;
  plugins: Map<string, PluginHealth>;
  lastCheck: Date;
}
```

---

## 10. 安全机制

### 10.1 认证

```typescript
// src/gateway/auth.js
export async function resolveGatewayAuth(
  request: GatewayRequest
): Promise<AuthResult> {
  // 检查 token
  const token = extractToken(request);

  // 验证 token
  const valid = await verifyToken(token);
  if (!valid) {
    return { authorized: false, reason: "invalid_token" };
  }

  // 获取权限
  const permissions = await getPermissions(token);

  return { authorized: true, permissions };
}
```

### 10.2 速率限制

```typescript
// src/gateway/auth-rate-limit.js
export function createAuthRateLimiter(): AuthRateLimiter {
  const attempts = new Map<string, number>();

  return {
    check(clientId: string): boolean {
      const count = attempts.get(clientId) ?? 0;
      return count < MAX_ATTEMPTS;
    },

    record(clientId: string): void {
      const count = attempts.get(clientId) ?? 0;
      attempts.set(clientId, count + 1);
    },

    reset(clientId: string): void {
      attempts.delete(clientId);
    }
  };
}
```

---

## 11. 错误处理

### 11.1 错误恢复

```typescript
// Gateway 错误处理策略
interface ErrorRecoveryStrategy {
  onPluginError(pluginId: string, error: Error): void;
  onChannelError(channelId: string, error: Error): void;
  onAgentError(agentId: string, error: Error): void;
}

// 策略：
// 1. 插件错误 → 禁用插件，通知用户
// 2. 渠道错误 → 重试，标记为不健康
// 3. Agent 错误 → 清理状态，尝试恢复
```

### 11.2 优雅关闭

```typescript
// Gateway 关闭流程
export async function shutdownGateway(server: GatewayServer): Promise<void> {
  // 1. 停止接收新请求
  server.stopAccepting();

  // 2. 等待现有请求完成
  await server.drain();

  // 3. 停止后台任务
  await stopBackgroundTasks();

  // 4. 保存状态
  await saveState();

  // 5. 关闭 Channel
  await stopChannels();

  // 6. 关闭插件
  await stopPlugins();

  // 7. 关闭服务器
  await server.close();
}
```

---

## 12. 监控与诊断

### 12.1 日志

```typescript
// 日志子系统
const gatewayLog = createSubsystemLogger("gateway");
const channelLog = createSubsystemLogger("channel");
const agentLog = createSubsystemLogger("agent");
const pluginLog = createSubsystemLogger("plugin");

// 日志级别
type LogLevel = "debug" | "info" | "warn" | "error";
```

### 12.2 追踪

```typescript
// 启动追踪
if (process.env.OPENCLAW_GATEWAY_STARTUP_TRACE) {
  // 输出启动各阶段耗时
  process.stderr.write(
    `[gateway] startup trace: entry.run-main-import 123.4ms total=1234.5ms\n`
  );
}
```

---

## 13. 核心设计决策

| 决策 | 为什么这样做 | 不这样做的后果 |
|------|--------------|----------------|
| 单进程架构 | 低延迟、简单部署 | 多进程通信复杂 |
| 插件式架构 | 易于扩展、隔离 | 核心代码膨胀 |
| 配置驱动 | 动态调整、远程配置 | 重启才能改配置 |
| 热重载 | 无停机更新 | 需要重启 |
| 分层日志 | 问题定位容易 | 日志量大 |

---

## 14. 缺点与不足

| 缺点 | 说明 |
|------|------|
| **单点故障** | Gateway 崩溃则整个系统不可用 |
| **资源限制** | 单进程内存有上限 |
| **启动时间** | 完整启动需要较长时间 |
| **调试困难** | 多组件交互难以追踪 |
| **扩展性有限** | 无法水平扩展 Gateway 本身 |

---

## 15. 下一步

- [07_配置系统.md](./07_配置系统.md) - 理解配置管理
- [08_工具系统.md](./08_工具系统.md) - 深入工具实现