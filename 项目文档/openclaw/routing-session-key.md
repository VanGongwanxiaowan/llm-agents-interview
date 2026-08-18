# 路由与会话键系统详解

> 本文档基于 `src/routing/` 目录下的源代码编写，旨在帮助你理解 OpenClaw 如何将"某条消息"稳定地路由到"某个 agent + 某个会话"。

---

## 一、核心概念：为什么需要路由？

当你给 bot 发一条消息，系统需要回答三个问题：

1. **这条消息应该由哪个 agent 处理？**（你可能配置了多个 agent，比如"客服 agent"、"技术助手 agent"）
2. **这条消息属于哪个会话（session）？**（同一个对话的消息应该串起来，而不是每次独立处理）
3. **消息的上下文是什么？**（私聊？群聊？频道？Discord 服务器？带着什么角色？）

路由系统（Routing）的职责就是：根据消息的上下文信息，从配置中找到一个最匹配的 binding 规则，然后返回一个**路由结果**，包含 agentId、sessionKey 等关键信息。

---

## 二、输入参数：路由的"原材料"

在 `resolve-agent-route.ts:26-37` 中，路由函数的输入是一个 `ResolveAgentRouteInput` 对象：

```typescript
type ResolveAgentRouteInput = {
  cfg: OpenClawConfig;        // 全局配置，包含 agents 列表和 bindings 规则
  channel: string;            // 渠道标识，如 "telegram", "discord", "slack"
  accountId?: string | null;  // 账号 ID（同一个 channel 下可能有多个账号）
  peer?: RoutePeer | null;     // 对等端信息
  parentPeer?: RoutePeer | null; // 父对等端（用于线程场景）
  guildId?: string | null;    // 服务器/组织 ID（Discord 等）
  teamId?: string | null;     // 团队 ID（Microsoft Teams 等）
  memberRoleIds?: string[];   // 成员角色 ID 列表（用于基于角色的路由）
};
```

### 为什么需要这么多字段？

这是一个**多维度匹配系统**，远比简单的"channel → agent"强大：

| 字段 | 含义 | 路由价值 |
|------|------|----------|
| `channel` | 渠道（telegram/discord/slack...） | 基础隔离，不同渠道走不同规则 |
| `accountId` | 账号 | 同一渠道的多账号隔离 |
| `peer` | 对等端（谁发的？是私聊还是群聊？） | **精确匹配**：某个具体群/频道/私聊 |
| `parentPeer` | 父对等端（线程的父消息所在会话） | **线程继承**：线程没有精确匹配时，继承父消息的 agent |
| `guildId` | Discord 服务器/组织 ID | **服务器级匹配** |
| `teamId` | 团队 ID | **团队级匹配** |
| `memberRoleIds` | 成员角色列表 | **基于角色的匹配**（如"只有管理员角色才能触发某 agent"） |

### peer 的结构

```typescript
type RoutePeer = {
  kind: ChatType;  // "direct" | "group" | "channel"
  id: string;      // 对等端 ID，如 Discord channel ID
};
```

- `direct`：私聊（1对1）
- `group`：群组聊天
- `channel`：频道/帖子（类似论坛的帖子频道）

---

## 三、Binding 规则：路由的"配置文件"

### 3.1 Binding 配置结构

在 `src/config/types.agents.ts:28-44` 中定义了 binding 的匹配结构：

```typescript
type AgentBindingMatch = {
  channel: string;      // 必填，渠道名（如 "discord"）
  accountId?: string;   // 可选，账号匹配（空或 "*" 表示任意账号）
  peer?: { kind: ChatType; id: string };  // 可选，对等端精确匹配
  guildId?: string;     // 可选，服务器 ID
  teamId?: string;      // 可选，团队 ID
  roles?: string[];     // 可选，角色 ID 列表
};

type AgentRouteBinding = {
  type?: "route";       // 默认为 route
  agentId: string;      // 目标 agent ID
  comment?: string;     // 注释
  match: AgentBindingMatch;
};
```

### 3.2 Binding 配置示例

一个完整的 binding 配置类似这样：

```yaml
bindings:
  - agentId: "support-agent"
    match:
      channel: "discord"
      guildId: "123456789"        # 匹配特定 Discord 服务器
      roles: ["987654321"]        # 并且用户有"管理员"角色
```

### 3.3 读取 Binding 规则

`src/config/bindings.ts:20-22` 提供了 `listRouteBindings` 函数：

```typescript
export function listRouteBindings(cfg: OpenClawConfig): AgentRouteBinding[] {
  return listConfiguredBindings(cfg).filter(isRouteBinding);
}
```

它从配置中读取所有 type 为 "route" 的 binding（另外还有 type 为 "acp" 的 binding，用于不同的目的）。

---

## 四、路由计算：逐层优先级的匹配过程

这是整个路由系统的核心。`resolve-agent-route.ts:614-804` 中的 `resolveAgentRoute` 函数实现了**7层优先级**的匹配。

### 4.1 优先级 tiers 定义

```typescript
const tiers: Array<{
  matchedBy: ResolvedAgentRoute["matchedBy"];  // 匹配方式标签
  enabled: boolean;                              // 是否启用（取决于是否有这个上下文）
  scopePeer: RoutePeer | null;                   // 用于匹配的 peer
  candidates: EvaluatedBinding[];                // 候选 binding 列表
  predicate: (candidate: EvaluatedBinding) => boolean;  // 过滤条件
}> = [
  { matchedBy: "binding.peer",        ... },  // 第1层：peer 精确匹配
  { matchedBy: "binding.peer.parent",  ... },  // 第2层：父 peer 继承
  { matchedBy: "binding.guild+roles", ... },  // 第3层：服务器+角色
  { matchedBy: "binding.guild",        ... },  // 第4层：服务器
  { matchedBy: "binding.team",         ... },  // 第5层：团队
  { matchedBy: "binding.account",      ... },  // 第6层：账号
  { matchedBy: "binding.channel",      ... },  // 第7层：渠道
];
```

### 4.2 每层详解

#### 第1层：`binding.peer` — peer 精确匹配

```typescript
{
  matchedBy: "binding.peer",
  enabled: Boolean(peer),  // 只有提供了 peer 信息才启用
  scopePeer: peer,
  candidates: collectPeerIndexedBindings(bindingsIndex, peer),
  predicate: (candidate) => candidate.match.peer.state === "valid",
}
```

**匹配条件**：binding 中 `match.peer` 有值，且 kind 和 id 都完全匹配。

**典型场景**：为某个**具体的 Discord 频道**或 **Telegram 群组**指定专门的 agent。

---

#### 第2层：`binding.peer.parent` — 线程父消息继承

```typescript
{
  matchedBy: "binding.peer.parent",
  enabled: Boolean(parentPeer && parentPeer.id),
  scopePeer: parentPeer && parentPeer.id ? parentPeer : null,
  candidates: collectPeerIndexedBindings(bindingsIndex, parentPeer),
  predicate: (candidate) => candidate.match.peer.state === "valid",
}
```

**匹配条件**：当前消息是线程，但线程本身没有精确匹配，利用 parentPeer（父消息所在会话）来继承 agent。

**典型场景**：你在 Discord 帖子频道创建了一个线程，这个线程本身没有专属 agent，但它应该继承父帖子所在的 agent。

---

#### 第3层：`binding.guild+roles` — 服务器 + 角色组合

```typescript
{
  matchedBy: "binding.guild+roles",
  enabled: Boolean(guildId && memberRoleIds.length > 0),
  scopePeer: peer,
  candidates: guildId ? (bindingsIndex.byGuildWithRoles.get(guildId) ?? []) : [],
  predicate: (candidate) =>
    hasGuildConstraint(candidate.match) && hasRolesConstraint(candidate.match),
}
```

**匹配条件**：binding 同时指定了 `guildId` 和 `roles`，且用户的角色 ID 列表中**至少有一个**匹配。

**典型场景**：Discord 服务器中，"管理员"角色的用户触发"管理 agent"，"版主"角色的用户触发"版主 agent"。

---

#### 第4层：`binding.guild` — 仅服务器匹配

```typescript
{
  matchedBy: "binding.guild",
  enabled: Boolean(guildId),
  scopePeer: peer,
  candidates: guildId ? (bindingsIndex.byGuild.get(guildId) ?? []) : [],
  predicate: (candidate) =>
    hasGuildConstraint(candidate.match) && !hasRolesConstraint(candidate.match),
}
```

**匹配条件**：binding 只指定了 `guildId`，没有 roles 限制。

---

#### 第5层：`binding.team` — 团队匹配

```typescript
{
  matchedBy: "binding.team",
  enabled: Boolean(teamId),
  scopePeer: peer,
  candidates: teamId ? (bindingsIndex.byTeam.get(teamId) ?? []) : [],
  predicate: (candidate) => hasTeamConstraint(candidate.match),
}
```

**匹配条件**：binding 的 `match.teamId` 与消息的 `teamId` 完全匹配。

**典型场景**：Microsoft Teams 中，不同团队使用不同的 agent。

---

#### 第6层：`binding.account` — 账号匹配

```typescript
{
  matchedBy: "binding.account",
  enabled: true,  // 始终启用
  scopePeer: peer,
  candidates: bindingsIndex.byAccount,
  predicate: (candidate) => candidate.match.accountPattern !== "*",
}
```

**匹配条件**：binding 的 `match.accountId` 非 `*`（非通配），与消息的 `accountId` 精确匹配。

---

#### 第7层：`binding.channel` — 渠道通配

```typescript
{
  matchedBy: "binding.channel",
  enabled: true,  // 始终启用
  scopePeer: peer,
  candidates: bindingsIndex.byChannel,
  predicate: (candidate) => candidate.match.accountPattern === "*",
}
```

**匹配条件**：`accountId` 为 `*`（通配符），匹配该 channel 下的任意账号。

---

#### 最终兜底：`default` agent

如果以上7层都没有匹配到任何 binding，系统返回默认 agent：

```typescript
return choose(resolveDefaultAgentId(input.cfg), "default");
```

---

### 4.3 peerLookupKeys：peer 索引的特殊处理

`resolve-agent-route.ts:334-342` 中的 `peerLookupKeys` 函数处理了一个边界情况：

```typescript
function peerLookupKeys(kind: ChatType, id: string): string[] {
  if (kind === "group") {
    return [`group:${id}`, `channel:${id}`];
  }
  if (kind === "channel") {
    return [`channel:${id}`, `group:${id}`];
  }
  return [`${kind}:${id}`];
}
```

**为什么要这样做？**

在 Discord 中，`group` 和 `channel` 的区分可能不严格。有些 API 返回的 kind 可能是 `group`，但实际是一个频道。生成两个 key 可以增加匹配的鲁棒性。

---

## 五、会话键（Session Key）：消息的"会话身份证"

### 5.1 为什么需要 Session Key？

Session key 的核心价值：

1. **会话连续性**：同一会话的消息能串起来，而不是每条消息独立处理
2. **并发隔离**：不同会话的消息可以并行处理，不会互相干扰
3. **存储分区**：按 session key 定位存储文件/数据库记录

### 5.2 Session Key 的格式

在 `session-key.ts:118-174` 中定义了两类 session key：

#### 主会话键（Main Session Key）

```typescript
function buildAgentMainSessionKey(params: {
  agentId: string;
  mainKey?: string;
}): string {
  const agentId = normalizeAgentId(params.agentId);
  const mainKey = normalizeMainKey(params.mainKey);
  return `agent:${agentId}:${mainKey}`;  // 例如 "agent:main:main"
}
```

**用途**：代表某个 agent 的主会话。用于直接聊天（direct）场景，不区分具体对等端。

#### 对等端会话键（Peer Session Key）

```typescript
function buildAgentPeerSessionKey(params: {
  agentId: string;
  mainKey?: string;
  channel: string;
  accountId?: string | null;
  peerKind?: ChatType | null;
  peerId?: string | null;
  identityLinks?: Record<string, string[]>;
  dmScope?: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
}): string
```

根据不同的 `dmScope` 生成不同粒度的 key：

| dmScope | 格式 | 含义 |
|---------|------|------|
| `"main"` (默认) | `agent:{agentId}:main` | 所有私聊共用一个 session |
| `"per-peer"` | `agent:{agentId}:direct:{peerId}` | 每个对等端一个 session |
| `"per-channel-peer"` | `agent:{agentId}:{channel}:direct:{peerId}` | 每个渠道+对等端一个 session |
| `"per-account-channel-peer"` | `agent:{agentId}:{channel}:{accountId}:direct:{peerId}` | 最细粒度，每个账号+渠道+对等端 |

群组/频道的 session key 格式为：

```typescript
return `agent:${normalizeAgentId(params.agentId)}:${channel}:${peerKind}:${peerId}`;
// 例如 "agent:support:telegram:group:123456"
```

### 5.3 线程会话键

`session-key.ts:234-253` 中的 `resolveThreadSessionKeys` 处理线程场景：

```typescript
function resolveThreadSessionKeys(params: {
  baseSessionKey: string;
  threadId?: string | null;
  parentSessionKey?: string;
  useSuffix?: boolean;
  normalizeThreadId?: (threadId: string) => string;
}): { sessionKey: string; parentSessionKey?: string } {
  if (!threadId) {
    return { sessionKey: params.baseSessionKey, parentSessionKey: undefined };
  }
  // 如果有 threadId，在 baseSessionKey 后面加上 ":thread:{threadId}"
  const sessionKey = `${params.baseSessionKey}:thread:${normalizedThreadId}`;
  return { sessionKey, parentSessionKey: params.parentSessionKey };
}
```

**线程 session key 格式**：`agent:support:telegram:direct:123:thread:456`

- 父会话 key 记录在 `parentSessionKey` 字段
- 可以通过 `resolveThreadParentSessionKey` 函数反向查找父会话

### 5.4 Session Key 的解析

`session-key-utils.ts:12-32` 提供了 `parseAgentSessionKey` 解析函数：

```typescript
export function parseAgentSessionKey(
  sessionKey: string | undefined | null,
): ParsedAgentSessionKey | null {
  const raw = (sessionKey ?? "").trim().toLowerCase();
  if (!raw) return null;

  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) return null;  // 至少 "agent:id:rest"
  if (parts[0] !== "agent") return null;

  return {
    agentId: parts[1],
    rest: parts.slice(2).join(":"),  // 剩余部分
  };
}
```

---

## 六、路由结果结构

`resolve-agent-route.ts:39-59` 定义了完整的路由返回结果：

```typescript
type ResolvedAgentRoute = {
  agentId: string;          // 匹配到的 agent ID
  channel: string;           // 渠道
  accountId: string;         // 账号 ID
  sessionKey: string;         // 内部用 session key（用于持久化和并发）
  mainSessionKey: string;    // 主 session key（直接聊天的降级别名）
  lastRoutePolicy: "main" | "session";  // 路由策略
  matchedBy:                 // 记录是怎么匹配到的（便于调试）
    | "binding.peer"
    | "binding.peer.parent"
    | "binding.guild+roles"
    | "binding.guild"
    | "binding.team"
    | "binding.account"
    | "binding.channel"
    | "default";
};
```

### `lastRoutePolicy` 的含义

```typescript
export function deriveLastRoutePolicy(params: {
  sessionKey: string;
  mainSessionKey: string;
}): ResolvedAgentRoute["lastRoutePolicy"] {
  return params.sessionKey === params.mainSessionKey ? "main" : "session";
}
```

- `"main"`：直接使用 mainSessionKey 作为最后路由目标（通常是 direct 私聊）
- `"session"`：使用具体 sessionKey（通常是群组、线程等）

---

## 七、性能优化：缓存机制

路由系统涉及大量配置数据的处理，为了避免每条消息都全量遍历 bindings，系统实现了多层缓存。

### 7.1 Binding 结果缓存

`resolve-agent-route.ts:194-211`：

```typescript
type EvaluatedBindingsCache = {
  bindingsRef: OpenClawConfig["bindings"];
  byChannel: Map<string, EvaluatedBindingsByChannel>;      // 按 channel 分组
  byChannelAccount: Map<string, EvaluatedBinding[]>;       // 按 channel+account 分组
  byChannelAccountIndex: Map<string, EvaluatedBindingsIndex>;
};
```

**缓存策略**：

1. **按 channel 分组**：`byChannel` 避免每次遍历所有 bindings
2. **按 channel+account 索引**：`byChannelAccount` 在 channel 基础上再按 account 细分
3. **按匹配类型索引**：`EvaluatedBindingsIndex` 里按 peer/guild/team/account 分别建立 Map

```typescript
type EvaluatedBindingsIndex = {
  byPeer: Map<string, EvaluatedBinding[]>;            // peer 精确匹配
  byGuildWithRoles: Map<string, EvaluatedBinding[]>;  // guild+roles 匹配
  byGuild: Map<string, EvaluatedBinding[]>;           // guild 匹配
  byTeam: Map<string, EvaluatedBinding[]>;           // team 匹配
  byAccount: EvaluatedBinding[];                      // account 匹配
  byChannel: EvaluatedBinding[];                      // channel 匹配
};
```

**缓存键**：`${channel}\t${accountId}`（使用 Tab 分隔，避免冲突）

**缓存上限**：`MAX_EVALUATED_BINDINGS_CACHE_KEYS = 2000`，超过后清空重建。

### 7.2 路由结果缓存

`resolve-agent-route.ts:203-212`：

```typescript
const resolvedRouteCacheByCfg = new WeakMap<
  OpenClawConfig,
  {
    bindingsRef: OpenClawConfig["bindings"];
    agentsRef: OpenClawConfig["agents"];
    sessionRef: OpenClawConfig["session"];
    byKey: Map<string, ResolvedAgentRoute>;
  }
>();
```

**缓存键**：`buildResolvedRouteCacheKey` 生成一个包含所有输入参数的组合键。

```typescript
function buildResolvedRouteCacheKey(params: {
  channel: string;
  accountId: string;
  peer: RoutePeer | null;
  parentPeer: RoutePeer | null;
  guildId: string;
  teamId: string;
  memberRoleIds: string[];
  dmScope: string;
}): string {
  return `${params.channel}\t${params.accountId}\t${formatPeer(params.peer)}\t...`;
}
```

**缓存条件**：
- 禁用了 verbose logging（`shouldLogVerbose()` 为 false）
- 没有配置 `identityLinks`（否则 session key 可能动态变化）

**缓存上限**：`MAX_RESOLVED_ROUTE_CACHE_KEYS = 4000`

### 7.3 Agent 查找缓存

`resolve-agent-route.ts:119-149`：

```typescript
type AgentLookupCache = {
  agentsRef: OpenClawConfig["agents"] | undefined;
  byNormalizedId: Map<string, string>;  // 规范化 ID → 原始 ID
  fallbackDefaultAgentId: string;
};
```

避免每次都遍历 agents 列表进行 ID 规范化。

---

## 八、完整的路由执行流程图

```
收到消息
    │
    ▼
┌─────────────────────────────────────────────┐
│  normalizeToken()                           │
│  规范化所有输入参数（channel, accountId,      │
│  peer, guildId, teamId, memberRoleIds）      │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  检查路由缓存 (routeCache)                   │
│  如果命中，直接返回缓存的 ResolvedAgentRoute  │
└────────────────────┬────────────────────────┘
                     │ (cache miss)
                     ▼
┌─────────────────────────────────────────────┐
│  getEvaluatedBindingsForChannelAccount()    │
│  1. 按 channel+account 加载/构建缓存         │
│  2. mergeEvaluatedBindingsInSourceOrder()    │
│     合并 account 特定 binding 和通配 binding │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  getEvaluatedBindingIndexForChannelAccount() │
│  构建 EvaluatedBindingsIndex（按 peer/      │
│  guild/team/account 建立二级索引）            │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  遍历 tiers (7层优先级)                      │
│                                             │
│  for tier in tiers:                        │
│    if not tier.enabled: continue           │
│    matched = tier.candidates.find(predicate)│
│    if matched: return choose(matched)       │
│                                             │
│  1. binding.peer         (peer 精确匹配)     │
│  2. binding.peer.parent  (父 peer 继承)      │
│  3. binding.guild+roles  (服务器+角色)       │
│  4. binding.guild        (服务器)           │
│  5. binding.team         (团队)             │
│  6. binding.account      (账号)              │
│  7. binding.channel      (渠道通配)         │
│                                             │
│  如果都不匹配 → default agent               │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│  choose(agentId, matchedBy)                │
│                                             │
│  1. pickFirstExistingAgentId()              │
│     验证 agentId 是否真实存在                │
│                                             │
│  2. buildAgentSessionKey()                  │
│     生成 sessionKey (根据 dmScope)           │
│                                             │
│  3. buildAgentMainSessionKey()              │
│     生成 mainSessionKey                     │
│                                             │
│  4. deriveLastRoutePolicy()                │
│     判断使用 main 还是 session               │
│                                             │
│  5. 写入路由缓存 (routeCache)               │
└────────────────────┬────────────────────────┘
                     │
                     ▼
               ResolvedAgentRoute
               (返回给下游使用)
```

---

## 九、配置示例与路由场景

### 场景1：Discord 私聊 → 客服 agent

**配置**：
```yaml
bindings:
  - agentId: "support-agent"
    match:
      channel: "discord"
      peer:
        kind: "direct"
        id: "123456"
```

**消息上下文**：
```javascript
{
  channel: "discord",
  accountId: "acc_001",
  peer: { kind: "direct", id: "123456" }
}
```

**匹配过程**：
- 第1层 `binding.peer` 命中：`peer.kind=direct` + `peer.id=123456` 匹配

**Session key**：`agent:support-agent:discord:direct:123456`

---

### 场景2：Discord 服务器 + 角色 → 不同 agent

**配置**：
```yaml
bindings:
  - agentId: "admin-agent"
    match:
      channel: "discord"
      guildId: "789012"
      roles: ["admin_role_id"]
  - agentId: "user-agent"
    match:
      channel: "discord"
      guildId: "789012"
```

**消息上下文**（管理员用户）：
```javascript
{
  channel: "discord",
  guildId: "789012",
  memberRoleIds: ["admin_role_id", "member_role_id"]
}
```

**匹配过程**：
- 第1层 `binding.peer`：未提供 peer，跳过
- 第3层 `binding.guild+roles` 命中：`guildId=789012` 匹配，且 `memberRoleIds` 包含 `admin_role_id`

**Session key**：`agent:admin-agent:discord:channel:789012`

---

### 场景3：线程继承父消息的 agent

**场景说明**：Discord 帖子频道中，用户在主帖下创建了一个 Thread，但这个 Thread 没有专属 binding。

**消息上下文**：
```javascript
{
  channel: "discord",
  peer: { kind: "channel", id: "thread_id" },
  parentPeer: { kind: "channel", id: "parent_post_id" }
}
```

**匹配过程**：
- 第1层 `binding.peer`：thread_id 没有精确匹配，跳过
- 第2层 `binding.peer.parent` 命中：parentPeer 匹配到某个 binding

**Session key**：`agent:xxx:discord:channel:parent_post_id:thread:thread_id`

---

### 场景4：Telegram 群组 + DM scope 测试

**配置**：
```yaml
session:
  dmScope: "per-peer"  # 每个对等端独立 session

bindings:
  - agentId: "group-agent"
    match:
      channel: "telegram"
      peer:
        kind: "group"
        id: "group_123"
```

**Session key**：`agent:group-agent:telegram:group:group_123`

如果是 `dmScope: "per-peer"` 的 direct 聊天：
**Session key**：`agent:group-agent:direct:user_456`

---

## 十、关键设计思想总结

### 1. 优先级分层设计

路由采用**逐层降级**的设计思想：
- 精确匹配优先（peer）
- 逐步扩大范围（parent → guild+roles → guild → team → account → channel）
- 最后兜底（default）

这种设计既保证了灵活性（可以精细控制），又保证了可维护性（不需要为所有可能组合都配置 binding）。

### 2. 多级缓存避免重复计算

- Binding 按 channel 预分组
- 每个 channel+account 组合建立独立缓存
- 路由结果按完整参数组合缓存
- 使用 WeakMap 让缓存随配置对象自动GC

### 3. Session Key 的可组合性

Session key 使用 `:` 分隔的层次结构，支持：
- 线程追加 `:thread:{id}`
- DM scope 动态调整粒度
- 跨渠道复用解析逻辑

### 4. 规范化处理

所有输入都经过 `normalizeToken()` / `normalizeId()` 处理：
- 去除首尾空白
- 转为小写
- 空值转为默认值

确保比较的稳定性和大小写不敏感性。

### 5. matchedBy 的调试价值

每个路由结果都记录了 `matchedBy`，告诉开发者"这条消息是根据什么规则匹配到这个 agent 的"。在调试路由配置时非常有用。

---

## 十一、相关源文件索引

| 文件 | 职责 |
|------|------|
| `src/routing/resolve-route.ts` | 核心路由算法，7层优先级匹配 |
| `src/routing/bindings.ts` | Binding 规范化、缓存构建 |
| `src/routing/session-key.ts` | Session key 生成（main/peer/thread） |
| `src/sessions/session-key-utils.ts` | Session key 解析和类型判断 |
| `src/config/types.agents.ts` | AgentBinding / AgentRouteBinding 类型定义 |
| `src/config/bindings.ts` | 读取配置中的 binding 列表 |
| `src/channels/chat-type.ts` | ChatType 枚举和规范化 |

---

*文档版本：基于当前代码库编写，如有出入请以源代码为准。*
