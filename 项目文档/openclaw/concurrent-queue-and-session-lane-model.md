# 并发队列与 Session-Lane 模型

> 源码基于：commit `1ec9037d4`（openclaw_opencode 集成）
> 对应文件：`src/process/command-queue.ts`、`src/process/lanes.ts`、`src/agents/pi-embedded-runner/lanes.ts`、`src/agents/pi-embedded-runner/runs.ts`、`src/gateway/server-lanes.ts`

---

## 一、设计目标

系统在并发请求下追求两个保证：

1. **同会话有序**：同一个 session 的多条消息必须按顺序处理，不能交叉回答
2. **全局可控**：不同 session 之间可以并发，但要受到全局并发数限制

这两个目标分别由 Session-Lane（会话队列）和 Global-Lane（全局队列）各自负责。

---

## 二、双层排队模型（核心机制）

### 2.1 每次 `runEmbeddedPiAgent` 调用会排两次队

```typescript
// src/agents/pi-embedded-runner/run.ts:268-285
const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
const globalLane = resolveGlobalLane(params.lane);

return enqueueSession(() =>        // ← 第一层：session lane
  enqueueGlobal(async () => {      // ← 第二层：global lane
    // 实际业务逻辑
  })
);
```

等价于：

```typescript
enqueueCommandInLane(sessionLane, () =>
  enqueueCommandInLane(globalLane, task)
);
```

**为什么要两层？**

| 层级 | Lane 名 | 作用 | 默认行为 |
|------|---------|------|---------|
| 外层 | `session:<key>` | 同 session 串行化 | 每个 session 队列最多 1 个并发 |
| 内层 | `main` / `subagent` / `cron` | 全局并发控制 | 按配置允许 N 个并发 |

内层先入队意味着：**先竞争全局并发名额**。拿到名额后，进入外层 session 队列，此时同 session 的请求会在 session 队列内排队，保证顺序。

### 2.2 具体例子

假设用户 A 连续发了两条消息（session=abc），同时用户 B 发了一条消息：

```
sessionLane for A: session:abc
  Queue: [msg_A_1(task), msg_A_2(task)]
sessionLane for B: session:xyz
  Queue: [msg_B_1(task)]
globalLane: main (maxConcurrent=4)
  Active: [task_A_1, task_B_1, ...]
```

执行顺序：

1. `msg_A_1` 和 `msg_B_1` 同时竞争 main lane 名额
2. 假设 main 有 4 个并发槽位，两者都可能同时执行
3. `msg_A_2` 排在 `session:abc` 队列中，等待 `msg_A_1` 完成
4. **不会**出现 `msg_A_1` 和 `msg_A_2` 交叉回答的情况

---

## 三、CommandLane 常量定义

```typescript
// src/process/lanes.ts
export const enum CommandLane {
  Main     = "main",      // 默认主 lane，所有未标记的 task 都走这里
  Cron     = "cron",      // 定时任务专用 lane
  Subagent = "subagent",  // 子 agent 并发控制 lane
  Nested   = "nested",    // 嵌套运行专用（防止死锁）
}
```

> **注意**：大纲中只列举了 Main / Cron / Subagent 三个，但源码中实际还有 **Nested**。它的存在原因是：Cron 任务触发嵌套 agent 运行时，如果内层也用 cron lane 会产生死锁（外层占用 cron slot 不释放，内层永远无法获得）。所以 `resolveGlobalLane("cron")` 会返回 `"nested"` 而非 `"cron"`。

---

## 四、Lane 名称解析规则

### 4.1 Session Lane 解析

```typescript
// src/agents/pi-embedded-runner/lanes.ts
export function resolveSessionLane(key: string) {
  const cleaned = key.trim() || CommandLane.Main;  // 空 key 落到 main
  return cleaned.startsWith("session:")
    ? cleaned                      // 已有前缀 → 直接返回（幂等）
    : `session:${cleaned}`;        // 无前缀 → 自动加上
}
```

**三个要点**：

1. **空字符串或纯空格** → 返回 `"session:main"`，不会返回裸 `"main"`
2. **已有 `session:` 前缀** → 直接返回，不重复加前缀（幂等性保证）
3. **无前缀** → 自动补全 `"session:<key>"`

### 4.2 Global Lane 解析

```typescript
// src/agents/pi-embedded-runner/lanes.ts
export function resolveGlobalLane(lane?: string) {
  const cleaned = lane?.trim();
  // Cron jobs hold the cron lane slot; inner operations must use nested to avoid deadlock.
  if (cleaned === CommandLane.Cron) {
    return CommandLane.Nested;  // ← 关键：cron 被映射为 nested
  }
  return cleaned ? cleaned : CommandLane.Main;  // 空 → main
}
```

**死锁防护**：当 cron 任务触发嵌套 agent 运行时，外层已占用 `cron` lane slot。如果内层也申请 `cron` lane，会永远等待——所以内层自动降级到 `nested`。

---

## 五、QueueEntry 精确结构

```typescript
// src/process/command-queue.ts
type QueueEntry = {
  task:        () => Promise<unknown>;   // 实际要执行的任务
  resolve:     (v: unknown) => void;      // 成功回调
  reject:      (e: unknown) => void;     // 失败回调
  enqueuedAt:  number;                    // 入队时间戳（毫秒）
  warnAfterMs: number;                    // 等待多久触发警告（默认 2000ms）
  onWait?:     (waitMs: number, queuedAhead: number) => void;  // 可选的等待回调
};
```

### 5.1 warnAfterMs 告警机制

```typescript
// command-queue.ts:103-113（drainLane 内部）
const waitedMs = Date.now() - entry.enqueuedAt;
if (waitedMs >= entry.warnAfterMs) {
  try {
    entry.onWait?.(waitedMs, state.queue.length);  // 调用注册的超时回调
  } catch (err) {
    diag.error(`lane onWait callback failed: lane=${lane} error="${String(err)}"`);
  }
  diag.warn(
    `lane wait exceeded: lane=${lane} waitedMs=${waitedMs} queueAhead=${state.queue.length}`,
  );
}
```

**触发条件**：任务进入队列后，等待被 pump 函数取出执行的时间超过了 `warnAfterMs`（默认 2 秒）。

**处理方式**：
1. 调用 `entry.onWait` 回调（如果有注册的话）
2. 打印一条 `warn` 级别诊断日志
3. **不会报错终止，只是警告**

**默认值**：`opts?.warnAfterMs ?? 2_000`（第 180 行）

---

## 六、LaneState 精确结构

```typescript
// src/process/command-queue.ts
type LaneState = {
  lane:           string;        // lane 名称，如 "main"、"session:abc"
  queue:          QueueEntry[]; // 等待执行的任务队列（FIFO）
  activeTaskIds:  Set<number>;   // 当前正在执行的任务 ID 集合
  maxConcurrent:  number;       // 该 lane 允许的最大并发数（默认 1）
  draining:       boolean;      // 是否正在 drain 循环中（防重复 pump）
  generation:     number;       // 递增版本号，用于让旧回调失效
};
```

### 6.1 draining 防重复 pump

`draining` 是一个**互斥锁**标志。在 `drainLane` 函数开头设置为 `true`，finally 块中恢复为 `false`：

```typescript
// command-queue.ts:87-151
function drainLane(lane: string) {
  const state = getLaneState(lane);
  if (state.draining) {
    // 已经在 pump 中，直接返回，不重复启动
    return;
  }
  state.draining = true;
  // ... pump 循环 ...
  finally {
    state.draining = false;
  }
}
```

如果 `draining = true` 时又来了新任务，pump 不会重复启动。下次 `enqueueCommandInLane` 会再次触发 `drainLane`，届时 `draining` 已重置，会正常启动 pump。

### 6.2 generation 防"热重启后旧 finally 块写脏状态"

generation 是本系统最重要的安全机制之一。来看 `completeTask` 的实现：

```typescript
// command-queue.ts:79-85
function completeTask(state: LaneState, taskId: number, taskGeneration: number): boolean {
  if (taskGeneration !== state.generation) {
    return false;  // generation 不匹配 → 忽略本次完成
  }
  state.activeTaskIds.delete(taskId);
  return true;
}
```

每个任务在启动时记录当时的 `state.generation`：

```typescript
// command-queue.ts:116
const taskGeneration = state.generation;  // 启动时保存
state.activeTaskIds.add(taskId);
void (async () => {
  try {
    const result = await entry.task();
    const completedCurrentGeneration = completeTask(state, taskId, taskGeneration);
    // ...
  }
})();
```

**场景**：SIGUSR1 热重启时，任务的 `finally` 块可能不执行，导致：
- `activeTaskIds` 中残留旧任务 ID
- 新任务永远无法启动（`while (state.activeTaskIds.size < state.maxConcurrent)` 条件不满足）

**解决**：`resetAllLanes()` 会：
1. `state.generation += 1`（递增版本）
2. `state.activeTaskIds.clear()`（清空残留任务 ID）

旧任务的 `finally` 块晚点执行时，`completeTask` 检查 `taskGeneration !== state.generation`，直接 return false，什么也不做。**不会误删新的 activeTaskIds**。

---

## 七、Probe Lane 特殊处理

### 7.1 识别 probe lane

```typescript
// command-queue.ts:132
const isProbeLane =
  lane.startsWith("auth-probe:") || lane.startsWith("session:probe-");
```

### 7.2 错误日志静默

```typescript
// command-queue.ts:130-137
} catch (err) {
  const completedCurrentGeneration = completeTask(state, taskId, taskGeneration);
  const isProbeLane = lane.startsWith("auth-probe:") || lane.startsWith("session:probe-");
  if (!isProbeLane) {
    diag.error(
      `lane task error: lane=${lane} durationMs=${Date.now() - startTime} error="${String(err)}"`,
    );
  }
  // ...
  entry.reject(err);
}
```

探针任务是"试错"性质的（比如 auth 探测连接是否可用），失败是**预期行为**。如果每次探测失败都打 error 日志，会污染日志且造成干扰。所以 probe lane 的任务失败时不输出 error 日志。

---

## 八、Active Run Registry（活动运行注册表）

### 8.1 数据结构

```typescript
// src/agents/pi-embedded-runner/runs.ts
type EmbeddedPiQueueHandle = {
  queueMessage: (text: string) => Promise<void>;  // 向流中注入消息
  isStreaming:  () => boolean;                    // 是否正在流式输出
  isCompacting: () => boolean;                    // 是否正在压缩上下文
  abort:        () => void;                        // 终止当前 run
};
```

全局注册表：`Map<sessionId, EmbeddedPiQueueHandle>`

### 8.2 queueMessage 的四个返回状态

```typescript
// runs.ts:41-58
export function queueEmbeddedPiMessage(sessionId: string, text: string): boolean {
  const handle = ACTIVE_EMBEDDED_RUNS.get(sessionId);
  if (!handle) {
    return false;  // 无活动 run
  }
  if (!handle.isStreaming()) {
    return false;  // 未在流式阶段（消息已全部发出，无法再注入）
  }
  if (handle.isCompacting()) {
    return false;  // 正在压缩，此时不允许注入消息
  }
  void handle.queueMessage(text);
  return true;  // 成功
}
```

**为什么需要这些判断？**

- `no_active_run`：session 没有正在运行的 agent，直接丢弃消息
- `not_streaming`：agent 已完成或还没开始流式输出，此时注入消息无意义
- `compacting`：上下文压缩期间注入可能导致消息被截断或乱序，暂时拒绝

### 8.3 clearActiveEmbeddedRun 的 handle 匹配校验

```typescript
// runs.ts:257-273
export function clearActiveEmbeddedRun(
  sessionId: string,
  handle: EmbeddedPiQueueHandle,
  sessionKey?: string,
) {
  if (ACTIVE_EMBEDDED_RUNS.get(sessionId) === handle) {
    // handle 匹配 → 正常清理
    ACTIVE_EMBEDDED_RUNS.delete(sessionId);
    ACTIVE_EMBEDDED_RUN_SNAPSHOTS.delete(sessionId);
    logSessionStateChange({ sessionId, sessionKey, state: "idle", reason: "run_completed" });
    notifyEmbeddedRunEnded(sessionId);
  } else {
    // handle 不匹配 → 跳过（防止旧 finally 块误删新 run）
    diag.debug(`run clear skipped: sessionId=${sessionId} reason=handle_mismatch`);
  }
}
```

**典型竞态场景**：

```
1. New run B 注册到 sessionId="abc"（handle=B）
2. Old run A 的 finally 块延迟执行，调用 clearActiveEmbeddedRun("abc", handle=A)
3. handle 不匹配（A !== B），跳过删除
4. Run B 继续正常运行，不受影响
```

### 8.4 waitForEmbeddedPiRunEnd 超时返回 false

```typescript
// runs.ts:182-214
export function waitForEmbeddedPiRunEnd(sessionId: string, timeoutMs = 15_000): Promise<boolean> {
  if (!sessionId || !ACTIVE_EMBEDDED_RUNS.has(sessionId)) {
    return Promise.resolve(true);  // 没有 run → 立即返回 true
  }
  return new Promise((resolve) => {
    const waiter = {
      resolve,
      timer: setTimeout(
        () => {
          // 超时 → 清理 waiter → resolve(false)
          resolve(false);
        },
        Math.max(100, timeoutMs),  // 最小 100ms
      ),
    };
    // ...
    if (!ACTIVE_EMBEDDED_RUNS.has(sessionId)) {
      // run 已经结束 → 立即 resolve(true)
      clearTimeout(waiter.timer);
      resolve(true);
    }
  });
}
```

**关键设计**：
- 超时 → 返回 `false`（不是 reject）
- 正常结束 → 返回 `true`
- 默认超时：15 秒
- 最小超时：`Math.max(100, timeoutMs)`

---

## 九、并发配置入口

### 9.1 配置到并发的映射

```typescript
// src/gateway/server-lanes.ts
export function applyGatewayLaneConcurrency(cfg: ReturnType<typeof loadConfig>) {
  setCommandLaneConcurrency(CommandLane.Cron,     cfg.cron?.maxConcurrentRuns ?? 1);
  setCommandLaneConcurrency(CommandLane.Main,     resolveAgentMaxConcurrent(cfg));
  setCommandLaneConcurrency(CommandLane.Subagent, resolveSubagentMaxConcurrent(cfg));
}
```

### 9.2 并发数解析默认值

```typescript
// src/config/agent-limits.ts
export const DEFAULT_AGENT_MAX_CONCURRENT = 4;
export const DEFAULT_SUBAGENT_MAX_CONCURRENT = 8;

export function resolveAgentMaxConcurrent(cfg?: OpenClawConfig): number {
  const raw = cfg?.agents?.defaults?.maxConcurrent;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw));
  }
  return DEFAULT_AGENT_MAX_CONCURRENT;  // 默认 4
}

export function resolveSubagentMaxConcurrent(cfg?: OpenClawConfig): number {
  const raw = cfg?.agents?.defaults?.subagents?.maxConcurrent;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw));
  }
  return DEFAULT_SUBAGENT_MAX_CONCURRENT;  // 默认 8
}
```

**三个 lane 的默认并发数**：

| Lane | 默认并发 | 配置路径 |
|------|---------|---------|
| `main` | 4 | `agents.defaults.maxConcurrent` |
| `subagent` | 8 | `agents.defaults.subagents.maxConcurrent` |
| `cron` | 1 | `cron.maxConcurrentRuns` |

### 9.3 setCommandLaneConcurrency 实现

```typescript
// command-queue.ts:161-166
export function setCommandLaneConcurrency(lane: string, maxConcurrent: number) {
  const cleaned = lane.trim() || CommandLane.Main;
  const state = getLaneState(cleaned);
  state.maxConcurrent = Math.max(1, Math.floor(maxConcurrent));  // 最少 1
  drainLane(cleaned);  // 触发 pump 立即开始消费积压任务
}
```

设置并发数后立即触发 drain，即使当前有任务在排队也会立即开始执行新的任务。

---

## 十、resetAllLanes 设计意图

### 10.1 源码注释（精确原文）

```typescript
// command-queue.ts:237-250
/**
 * Reset all lane runtime state to idle. Used after SIGUSR1 in-process
 * restarts where interrupted tasks' finally blocks may not run, leaving
 * stale active task IDs that permanently block new work from draining.
 *
 * Bumps lane generation and clears execution counters so stale completions
 * from old in-flight tasks are ignored. Queued entries are intentionally
 * preserved — they represent pending user work that should still execute
 * after restart.
 *
 * After resetting, drains any lanes that still have queued entries so
 * preserved work is pumped immediately rather than waiting for a future
 * `enqueueCommandInLane()` call (which may never come).
 */
export function resetAllLanes(): void { ... }
```

### 10.2 三步重置流程

```
for each lane:
  1. generation += 1          ← 让旧任务的 completeTask 失效
  2. activeTaskIds.clear()   ← 清除残留的活跃任务
  3. draining = false        ← 重置 drain 状态

then for each lane with queue:
  4. drainLane(lane)         ← 立即开始处理积压任务
```

**关键点**：队列中的任务（`state.queue`）**没有被清空**——这些是用户等待执行的命令，重启后应该继续执行。真正被清理的是"正在执行但被中断"的任务留下的状态。

---

## 十一、GatewayDraining 机制

### 11.1 防止重启时新任务被"静默杀死"

```typescript
// command-queue.ts:176-178
export function enqueueCommandInLane<T>(...): Promise<T> {
  if (queueState.gatewayDraining) {
    return Promise.reject(new GatewayDrainingError());
  }
  // ...
}
```

网关准备重启时调用 `markGatewayDraining()`：

```typescript
// command-queue.ts:157-159
export function markGatewayDraining(): void {
  queueState.gatewayDraining = true;
}
```

之后所有新进入 `enqueueCommandInLane` 的任务会**立即以错误 reject**，而不是被接受后在重启时被杀。这样重启流程可以干净地等待所有已有任务完成。

---

## 十二、waitForActiveTasks 与 waitForActiveEmbeddedRuns

两个等待函数服务于不同的重启场景：

| 函数 | 等待目标 | 超时行为 | 典型用途 |
|------|---------|---------|---------|
| `waitForActiveTasks` | 所有 lane 的 `activeTaskIds` | 返回 `{drained: false}` | SIGUSR1 重启前 |
| `waitForActiveEmbeddedRuns` | `ACTIVE_EMBEDDED_RUNS.size === 0` | 返回 `{drained: false}` | 压缩上下文释放 |

两者都**不 reject**，只返回成功/失败的结构。

---

## 十三、整体数据流图

```
runEmbeddedPiAgent(params)
  │
  ├─ sessionLane = resolveSessionLane(sessionKey)  → "session:user-abc"
  ├─ globalLane  = resolveGlobalLane(lane)        → "main" / "subagent" / "nested"
  │
  └─ enqueueSession(() =>
       enqueueGlobal(task)           ← 双层排队
     )

外层 (session lane):
  enqueueCommandInLane("session:user-abc", outerTask)
    → state.queue.push(entry)
    → drainLane("session:user-abc")
      → pump 等待: activeTaskIds.size < maxConcurrent(默认1)
      → 取出一个 outerTask 执行

内层 (global lane):
  outerTask 执行时调用 enqueueGlobal(task)
    → enqueueCommandInLane("main", innerTask)
    → drainLane("main")
      → pump: activeTaskIds.size < maxConcurrent(默认4)
      → 多个 session 的任务可以并发执行
```

---

## 十四、自检清单（附源码依据）

| 检查项 | 源码依据 |
|--------|---------|
| 同一 session 连发多条消息，回复顺序稳定 | 外层 `session:abc` lane 默认 `maxConcurrent=1`，串行执行 |
| `resolveSessionLane` 对已有 `session:` 前缀幂等 | `cleaned.startsWith("session:") ? cleaned : \`session:\${cleaned}\`` |
| 空 key 回落到 `CommandLane.Main` | `key.trim() \|\| CommandLane.Main`，空字符串走 main |
| warnAfterMs 超时只触发告警，不报错终止 | `command-queue.ts:104-113`，warn + 调用 onWait，不 reject |
| probe lane 失败被静默处理 | `command-queue.ts:132-137`，`!isProbeLane` 才打 error |
| `clearActiveEmbeddedRun` 有 handle 匹配校验 | `runs.ts:262`，`get(sessionId) === handle` 才删除 |
| `waitForEmbeddedPiRunEnd` 超时返回 false 不 reject | `runs.ts:197-198`，`resolve(false)` 而非 `reject()` |
| `Cron` lane 实际映射为 `Nested` | `lanes.ts:11-13`，防止死锁 |

---

## 十五、与大纲的差异对照

| 大纲描述 | 源码实际情况 |
|---------|-------------|
| CommandLane 只有 Main/Cron/Subagent 三个 | 实际上有 **4 个**，包括 `Nested` |
| `resolveGlobalLane("cron")` 返回 `CommandLane.Cron` | 实际返回 `CommandLane.Nested`（死锁保护）|
| `EmbeddedPiQueueHandle.isStreaming` 是 boolean 属性 | 实际是 `() => boolean` **方法**，因为 handle 来自闭包 |
| `clearActiveEmbeddedRun` 的 handle 校验 | 大纲描述准确，源码在 `runs.ts:262` |
