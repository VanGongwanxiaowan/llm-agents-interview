# Skills 快照与注入机制详解

> 本文面向想要深入理解 OpenClaw Agent 技能系统运作原理的学习者。所有源码路径均基于 `src/` 根目录。

---

## 一、整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      写入 Session                                │
│  buildWorkspaceSkillSnapshot()  →  skillsSnapshot  →  SessionEntry │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  变更监听（Watcher）                                              │
│  refresh.ts  →  bumpSkillsSnapshotVersion()  →  version 递增     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  运行期注入（Injection）                                         │
│  applySkillEnvOverridesFromSnapshot()  →  process.env           │
│  resolveSkillsPromptForRun()  →  prompt string                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、为什么需要"快照"（Snapshot）

### 问题背景

在 agent 运行过程中，如果每次都重新扫描整个技能目录，会有两个严重问题：

1. **性能开销巨大**：一个 workspace 下可能有成百上千个技能文件，每次 turn 都重新扫描会拖慢响应速度。

2. **技能上下文不稳定**：同一次 session 中，如果用户修改了某个 SKILL.md，下一个 turn 可能看到不同的技能列表，导致模型行为不一致。

### 快照的解决方案

快照把"从文件系统扫描技能"这件事变成"从内存中读取已准备好的数据"，快且稳定。

```typescript
// 快照的结构（src/agents/skills/types.ts:82-89）
export type SkillSnapshot = {
  prompt: string;                          // 给模型看的技能描述文本
  skills: Array<{                           // 可用技能列表（精简版）
    name: string;
    primaryEnv?: string;
    requiredEnv?: string[];
  }>;
  skillFilter?: string[];                  // agent 级别的过滤条件
  resolvedSkills?: Skill[];               // 完整技能对象（可缺失）
  version?: number;                        // 快照版本号，驱动重新构建
};
```

---

## 三、快照的生成链路

### 3.1 入口：`buildWorkspaceSkillSnapshot`（src/agents/skills/workspace.ts:567-584）

```typescript
export function buildWorkspaceSkillSnapshot(
  workspaceDir: string,
  opts?: WorkspaceSkillBuildOptions & { snapshotVersion?: number },
): SkillSnapshot {
  const { eligible, prompt, resolvedSkills } = resolveWorkspaceSkillPromptState(workspaceDir, opts);
  // eligible  = 经过 allowlist / install 状态过滤后的技能条目
  // prompt   = 生成给模型看的技能描述文本
  // resolvedSkills = 技能对象的完整列表
  return {
    prompt,
    skills: eligible.map((entry) => ({
      name: entry.skill.name,
      primaryEnv: entry.metadata?.primaryEnv,
      requiredEnv: entry.metadata?.requires?.env?.slice(),
    })),
    ...(skillFilter === undefined ? {} : { skillFilter }),
    resolvedSkills,   // 完整技能对象，供后续 env 注入使用
    version: opts?.snapshotVersion,
  };
}
```

### 3.2 内部三步曲（src/agents/skills/workspace.ts:603-638）

快照构建内部经历三个阶段：

#### 第一步：扫描所有技能 — `loadSkillEntries`

```typescript
function loadSkillEntries(workspaceDir, opts?): SkillEntry[]
```

从 **6 个来源** 扫描技能，优先级从低到高：

| 优先级 | 来源 | 路径 |
|---|---|---|
| 1 (最低) | `extraDirs` | 用户配置的额外技能目录 |
| 2 | `bundledSkillsDir` | OpenClaw 内置技能 |
| 3 | `managedSkillsDir` | `~/.openclaw/skills` |
| 4 | `personalAgentsSkillsDir` | `~/.agents/skills` |
| 5 | `projectAgentsSkillsDir` | `.agents/skills` |
| 6 (最高) | `workspaceSkillsDir` | `workspace/skills` |

同名技能会被高优先级来源**覆盖**，最终以 `Map<string, Skill>` 合并。

**安全防护** — 扫描过程中做了三层保护：

1. **路径 containment 检查**（workspace.ts:201-221）：
   ```typescript
   function resolveContainedSkillPath(params) {
     const candidateRealPath = tryRealpath(params.candidatePath);
     if (isPathInside(params.rootRealPath, candidateRealPath)) {
       return candidateRealPath;  // 安全，在配置根目录下
     }
     warnEscapedSkillPath(...);    // 警告：符号链接逃逸
     return null;
   }
   ```
   防止符号链接将技能目录伪装在配置根之外。

2. **文件大小限制**：跳过超过 `maxSkillFileBytes`（默认 256KB）的 SKILL.md。

3. **数量上限**：
   - `maxCandidatesPerRoot = 300`：单个 skills 根目录下最多扫描 300 个子目录
   - `maxSkillsLoadedPerSource = 200`：单个来源最多加载 200 个技能
   - `maxSkillsInPrompt = 150`：进入 prompt 的最多 150 个技能

#### 第二步：过滤技能 — `filterSkillEntries`

```typescript
function filterSkillEntries(entries, config?, skillFilter?, eligibility?): SkillEntry[]
```

三个维度的过滤条件：

**维度一：Config 过滤**（src/agents/skills/config.ts:71-103）

```typescript
function shouldIncludeSkill({ entry, config, eligibility }): boolean {
  const skillConfig = resolveSkillConfig(config, skillKey);

  // 1. 配置文件明确禁用
  if (skillConfig?.enabled === false) return false;

  // 2. 内置技能不在 allowBundled 白名单中
  if (!isBundledSkillAllowed(entry, allowBundled)) return false;

  // 3. 运行时平台/二进制 Eligibility 检查
  return evaluateRuntimeEligibility({
    os: entry.metadata?.os,
    remotePlatforms: eligibility?.remote?.platforms,
    always: entry.metadata?.always,
    requires: entry.metadata?.requires,
    hasBin: hasBinary,                    // 本地是否有这个二进制
    hasRemoteBin: eligibility?.remote?.hasBin,  // 远程平台是否有
    hasEnv: (envName) => Boolean(
      process.env[envName] ||
      skillConfig?.env?.[envName] ||
      (skillConfig?.apiKey && entry.metadata?.primaryEnv === envName)
    ),
    isConfigPathTruthy: (configPath) => isConfigPathTruthy(config, configPath),
  });
}
```

**维度二：SkillFilter 过滤**（workspace.ts:76-87）

```typescript
// 如果命令行指定了 --skill-filter，只保留白名单中的技能
if (skillFilter !== undefined) {
  const normalized = normalizeSkillFilter(skillFilter) ?? [];
  filtered = normalized.length > 0
    ? filtered.filter((entry) => normalized.includes(entry.skill.name))
    : [];  // 空 filter = 一个都不选
}
```

**维度三：InvocationPolicy 过滤**（workspace.ts:618-619）

```typescript
const promptEntries = eligible.filter(
  (entry) => entry.invocation?.disableModelInvocation !== true
);
```

`disableModelInvocation: true` 的技能不进入 prompt 文本，但**仍然会注入 env 变量**。这是给那些需要 API key 但不希望模型主动调用的技能使用的。

#### 第三步：生成 prompt — `applySkillsPromptLimits`

```typescript
function applySkillsPromptLimits({ skills, config }): {
  skillsForPrompt: Skill[];
  truncated: boolean;
  truncatedReason: "count" | "chars" | null;
}
```

**Token 预算控制**（workspace.ts:529-565）：

1. 先按名称排序，取前 `maxSkillsInPrompt`（默认 150 个）
2. 调用 `formatSkillsForPrompt(skills)` 生成文本
3. 如果超过 `maxSkillsPromptChars`（默认 30,000 字符），用**二分查找**找最大能塞进预算的前缀

```typescript
// 二分查找：找最大的 prefix 长度使 fits(skillsForPrompt.slice(0, mid)) 为 true
let lo = 0, hi = skillsForPrompt.length;
while (lo < hi) {
  const mid = Math.ceil((lo + hi) / 2);
  if (fits(skillsForPrompt.slice(0, mid))) {
    lo = mid;
  } else {
    hi = mid - 1;
  }
}
skillsForPrompt = skillsForPrompt.slice(0, lo);
```

**路径压缩**：将 `/Users/alice/.bun/.../skills/github/SKILL.md` 压缩为 `~/.bun/.../skills/github/SKILL.md`，节省约 5-6 tokens/技能 × N 技能 ≈ 400-600 tokens 总计（workspace.ts:46-54）。

---

## 四、环境变量注入机制（src/agents/skills/env-overrides.ts）

### 4.1 为什么需要特殊处理

Skills 的 `env` 配置会往 `process.env` 注入变量（如 `OPENAI_API_KEY`）。这有两个风险：

1. **泄露风险**：注入的 key 可能被子进程（如 Codex CLI）意外读取
2. **污染风险**：注入的变量会影响当前进程后续的操作

### 4.2 核心数据结构：引用计数

```typescript
type ActiveSkillEnvEntry = {
  baseline: string | undefined;  // 注入前的原始值（undefined = 原本不存在）
  value: string;                 // 注入的值
  count: number;                // 被多少个技能引用（嵌套场景）
};

const activeSkillEnvEntries = new Map<string, ActiveSkillEnvEntry>();
```

**为什么要引用计数？**
因为多个技能可能注入同一个 key（如两个技能都用 `OPENAI_API_KEY`）。只有当所有引用都释放时，才真正还原。

### 4.3 注入函数：`applySkillConfigEnvOverrides`

注入值有三个优先级：

```typescript
// 优先级 1：技能自己的 env 配置
if (skillConfig.env) {
  for (const [rawKey, envValue] of Object.entries(skillConfig.env)) {
    const hasExternallyManagedValue =
      process.env[envKey] !== undefined && !activeSkillEnvEntries.has(envKey);
    if (!envKey || !envValue || hasExternallyManagedValue) {
      continue;  // 跳过，不覆盖用户已有的值
    }
    pendingOverrides[envKey] = envValue;
  }
}

// 优先级 2：apiKey 配置注入到 primaryEnv
const canInjectPrimaryEnv =
  normalizedPrimaryEnv &&
  (process.env[normalizedPrimaryEnv] === undefined ||
    activeSkillEnvEntries.has(normalizedPrimaryEnv));
if (canInjectPrimaryEnv && resolvedApiKey) {
  pendingOverrides[normalizedPrimaryEnv] = resolvedApiKey;
}
```

关键规则：**只有外部没有管理这个 key 时才注入**。如果用户已经设置了 `OPENAI_API_KEY`，技能不会覆盖它。

### 4.4 安全过滤：`sanitizeSkillEnvOverrides`

```typescript
// 始终阻止的 Pattern（即使在 allowlist 中）
const SKILL_ALWAYS_BLOCKED_ENV_PATTERNS: ReadonlyArray<RegExp> = [/^OPENSSL_CONF$/i];

function isAlwaysBlockedSkillEnvKey(key: string): boolean {
  return (
    isDangerousHostEnvVarName(key) ||    // 来自 host-env-security.ts
    matchesAnyPattern(key, SKILL_ALWAYS_BLOCKED_ENV_PATTERNS)
  );
}
```

`isDangerousHostEnvVarName` 阻止那些能改变运行时加载行为或 host 执行行为的危险变量。

### 4.5 还原机制：`createEnvReverter`

```typescript
function createEnvReverter(updates: EnvUpdate[]) {
  return () => {
    for (const update of updates) {
      releaseActiveSkillEnvKey(update.key);  // 递减引用计数，必要时还原 baseline
    }
  };
}
```

返回的是一个闭包函数，**调用方在 agent 运行结束后必须调用**。`releaseActiveSkillEnvKey` 的逻辑：

```typescript
function releaseActiveSkillEnvKey(key: string) {
  const active = activeSkillEnvEntries.get(key);
  if (!active) return;

  active.count -= 1;
  if (active.count > 0) return;  // 还有其他引用，保持注入

  // count == 0，真正释放
  activeSkillEnvEntries.delete(key);
  if (active.baseline === undefined) {
    delete process.env[key];      // 原本不存在，删掉
  } else {
    process.env[key] = active.baseline;  // 还原原始值
  }
}
```

### 4.6 两个注入入口

| 函数 | 用途 | 触发场景 |
|---|---|---|
| `applySkillEnvOverrides` | 从 SkillEntry[] 注入 | 无 snapshot 时（首次运行） |
| `applySkillEnvOverridesFromSnapshot` | 从 SkillSnapshot 注入 | 有 snapshot 时（后续 turn） |

两者最终调用相同的 `applySkillConfigEnvOverrides`，只是数据来源不同。

---

## 五、变更监听机制（src/agents/skills/refresh.ts）

### 5.1 为什么只监听 SKILL.md 文件

如果监听整个目录树，而 workspace 下有大量数据集文件，会耗尽文件描述符（FD exhaustion on macOS）。

```typescript
function resolveWatchTargets(workspaceDir, config?): string[] {
  const targets = new Set<string>();
  for (const root of resolveWatchPaths(...)) {
    targets.add(`${globRoot}/SKILL.md`);       // 根目录下的单个技能
    targets.add(`${globRoot}/*/SKILL.md`);     // skills/*/SKILL.md 标准布局
  }
  return Array.from(targets).toSorted();
}
```

这样 watcher 只盯 SKILL.md 文件，不进入其他目录。

### 5.2 忽略模式

```typescript
const DEFAULT_SKILLS_WATCH_IGNORED = [
  /(^|[\\/])\.git([\\/]|$)/,
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])dist([\\/]|$)/,
  /(^|[\\/])\.venv([\\/]|$)/,
  /(^|[\\/])venv([\\/]|$)/,
  /(^|[\\/])\.mypy_cache([\\/]|$)/,
  /(^|[\\/])\.pytest_cache([\\/]|$)/,
];
```

### 5.3 防抖（Debounce）

```typescript
const debounceMs = config?.skills?.load?.watchDebounceMs ?? 250;

const schedule = (changedPath?: string) => {
  state.pendingPath = changedPath;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    bumpSkillsSnapshotVersion({
      workspaceDir,
      reason: "watch",
      changedPath: state.pendingPath,
    });
  }, debounceMs);  // 250ms 内多次变更只触发一次重建
};
```

### 5.4 版本号体系：`bumpVersion`

```typescript
function bumpVersion(current: number): number {
  const now = Date.now();
  return now <= current ? current + 1 : now;  // 保证单调递增
}

export function bumpSkillsSnapshotVersion(params?): number {
  if (params?.workspaceDir) {
    const current = workspaceVersions.get(params.workspaceDir) ?? 0;
    const next = bumpVersion(current);
    workspaceVersions.set(params.workspaceDir, next);  // workspace 级版本
    emit({ workspaceDir: params.workspaceDir, reason, changedPath });
    return next;
  }
  globalVersion = bumpVersion(globalVersion);  // 全局版本
  emit({ reason, changedPath });
  return globalVersion;
}
```

两层版本的设计：`getSkillsSnapshotVersion` 取 `Math.max(globalVersion, local)`，确保无论哪个 workspace 的技能变更，都能被感知到，同时 workspace 之间的变更互不干扰。

### 5.5 事件广播

```typescript
const listeners = new Set<(event: SkillsChangeEvent) => void>();

export function registerSkillsChangeListener(listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);  // 返回取消订阅函数
}
```

### 5.6 确保 watcher 单一性：`ensureSkillsWatcher`

```typescript
function ensureSkillsWatcher({ workspaceDir, config }) {
  // 如果 watch 配置为 false，关闭已有 watcher
  if (!watchEnabled) {
    if (existing) {
      watchers.delete(workspaceDir);
      clearTimeout(existing.timer);
      existing.watcher.close();
    }
    return;
  }

  // 如果配置没变（pathsKey + debounceMs 相同），不做任何事
  if (existing && existing.pathsKey === pathsKey && existing.debounceMs === debounceMs) {
    return;
  }

  // 配置变了，关闭旧 watcher，创建新的
  ...
}
```

---

## 六、快照与 Session/Agent 的关系

### 6.1 何时写入快照（src/commands/agent.ts:876-906）

```typescript
const needsSkillsSnapshot = isNewSession || !sessionEntry?.skillsSnapshot;
const skillsSnapshotVersion = getSkillsSnapshotVersion(workspaceDir);
const skillFilter = resolveAgentSkillsFilter(cfg, sessionAgentId);

// 新 session 或者 session 没有 snapshot 时，重新构建
const skillsSnapshot = needsSkillsSnapshot
  ? buildWorkspaceSkillSnapshot(workspaceDir, {
      config: cfg,
      eligibility: { remote: getRemoteSkillEligibility() },
      snapshotVersion: skillsSnapshotVersion,
      skillFilter,
    })
  : sessionEntry?.skillsSnapshot;  // 复用已有 snapshot

// 如果是新 snapshot，立即持久化到 session store
if (skillsSnapshot && sessionStore && sessionKey && needsSkillsSnapshot) {
  const next: SessionEntry = {
    ...current,
    sessionId,
    updatedAt: Date.now(),
    skillsSnapshot,
  };
  await persistSessionEntry({ sessionStore, sessionKey, storePath, entry: next });
  sessionEntry = next;
}
```

**关键决策点**：`needsSkillsSnapshot = isNewSession || !sessionEntry?.skillsSnapshot`

| 场景 | 行为 |
|---|---|
| 新 session | 重新构建 snapshot |
| 旧 session，之前没有 snapshot（如老数据迁移场景） | 重新构建 |
| 旧 session，已有 snapshot | 复用，**跳过文件系统扫描** |

### 6.2 SessionEntry 中的快照存储（src/config/sessions/types.ts:171）

```typescript
export type SessionEntry = {
  // ...
  skillsSnapshot?: SessionSkillSnapshot;  // 持久化在 session 中
  // ...
};
```

快照存储在 session 条目中，这意味着**同一 session 的后续 turn 直接沿用**，不用重新扫描文件系统。这是整个机制的核心收益。

### 6.3 运行期注入（src/agents/pi-embedded-runner/run/attempt.ts:1413-1432）

```typescript
const { shouldLoadSkillEntries, skillEntries } = resolveEmbeddedRunSkillEntries({
  workspaceDir: effectiveWorkspace,
  config: params.config,
  skillsSnapshot: params.skillsSnapshot,
});

// 判断逻辑（src/agents/pi-embedded-runner/skills-runtime.ts:12）
// 如果 snapshot 有 resolvedSkills → 不需要重新加载 entry
// 如果 snapshot 为空或没有 resolvedSkills → 临时加载 entry
restoreSkillEnv = params.skillsSnapshot
  ? applySkillEnvOverridesFromSnapshot({ snapshot: params.skillsSnapshot, config: params.config })
  : applySkillEnvOverrides({ skills: skillEntries ?? [], config: params.config });

const skillsPrompt = resolveSkillsPromptForRun({
  skillsSnapshot: params.skillsSnapshot,
  entries: shouldLoadSkillEntries ? skillEntries : undefined,
  config: params.config,
  workspaceDir: effectiveWorkspace,
});
```

`resolveSkillsPromptForRun` 优先返回 `snapshot.prompt`，如果为空才临时生成（workspace.ts:640-658），保证 session 内 prompt 的稳定性。

---

## 七、全流程时序图

```
[用户发送消息]
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ agentCommandInternal()                               │
│                                                      │
│  1. resolveSession()                                  │
│  2. needsSkillsSnapshot = isNewSession || !snapshot   │
│                                                      │
│  3. if (needsSkillsSnapshot):                        │
│     buildWorkspaceSkillSnapshot()                    │
│       ├─ loadSkillEntries()  [扫描6个来源]           │
│       ├─ filterSkillEntries() [allowlist/os/bin/env]│
│       ├─ applySkillsPromptLimits() [token预算]       │
│       └─ 返回 { prompt, skills, version }            │
│                                                      │
│  4. persistSessionEntry() → 写入 SessionEntry         │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ runEmbeddedPiAgent() → runAgentAttempt()            │
│                                                      │
│  5. resolveEmbeddedRunSkillEntries()                 │
│     - snapshot 有 resolvedSkills → 跳过加载          │
│     - 否则 → loadWorkspaceSkillEntries()             │
│                                                      │
│  6. applySkillEnvOverridesFromSnapshot() 或          │
│     applySkillEnvOverrides()                         │
│     - 遍历 skills，注入 env 到 process.env           │
│     - 返回 restoreSkillEnv() 还原函数                 │
│                                                      │
│  7. resolveSkillsPromptForRun() → 从 snapshot 取     │
│                                                      │
│  8. [Agent 运行...]                                  │
│                                                      │
│  9. restoreSkillEnv() 调用 → 还原所有注入的 env      │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ SKILL.md 被用户编辑 → watch 事件触发                 │
│                                                      │
│  10. schedule() [debounce 250ms]                     │
│  11. bumpSkillsSnapshotVersion()                    │
│       - workspaceVersions[workspaceDir]++            │
│       - emit() → 通知所有 listeners                  │
│                                                      │
│  下一个 turn 时：                                    │
│  12. getSkillsSnapshotVersion() 返回新版本号          │
│  13. buildWorkspaceSkillSnapshot() 重新构建            │
└─────────────────────────────────────────────────────┘
```

---

## 八、设计亮点总结

| 设计点 | 解决的问题 |
|---|---|
| Snapshot 持久化在 SessionEntry | 同一 session 的多个 turn 复用技能上下文，避免重复扫描 |
| 两层版本号（global + workspace） | 兼顾全局变更感知和 workspace 隔离 |
| 引用计数的 env 注入 | 嵌套场景下正确还原（多个技能注入同一个 key） |
| 只监听 SKILL.md 文件 | 防止 FD exhaustion |
| 防抖 250ms | 避免频繁变更触发多次重建 |
| 路径压缩（~ 替换） | 节省 prompt token |
| 二分查找 + 字符预算 | 在 token 限制下塞入最多技能 |
| 优先使用 snapshot.prompt | 保持 session 内 prompt 稳定性 |
| 危险 env pattern 过滤 | 防止技能劫持 host 安全配置 |
| 外部已管理的 key 不覆盖 | 尊重用户已有配置 |
| 安全路径 containment 检查 | 防止符号链接逃逸到配置目录外 |

---

## 九、关键文件索引

| 文件 | 职责 |
|---|---|
| `src/agents/skills/types.ts` | Snapshot、Entry、Skill 等核心类型定义 |
| `src/agents/skills/workspace.ts` | 快照生成、prompt 构建、技能扫描的核心逻辑 |
| `src/agents/skills/env-overrides.ts` | 环境变量注入与还原机制 |
| `src/agents/skills/refresh.ts` | 文件 watcher、版本号管理、事件广播 |
| `src/agents/skills/config.ts` | allowlist、enable/disable、平台过滤规则 |
| `src/commands/agent.ts` | 快照写入 session 的入口点 |
| `src/agents/pi-embedded-runner/run/attempt.ts` | 运行期注入的具体调用点 |
| `src/agents/pi-embedded-runner/skills-runtime.ts` | 判断是否需要重新加载 SkillEntry |
| `src/config/sessions/types.ts` | SessionEntry.skillsSnapshot 字段定义 |