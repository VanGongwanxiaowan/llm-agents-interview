# 自动回复与 Agent 执行流水线详解

> 以 `openclaw` 项目为例，从一条消息进来到最终回复发出的完整流程分析。

---

## 整体架构鸟瞰

当你对着一群聊说了一句话，OpenClaw 处理它的链路大致是：

```
消息入口
  └─ dispatch.ts（调度入口）
       └─ dispatch-from-config.ts（消息编排 + 去重/中断）
            └─ get-reply.ts（决策 + 上下文构建）
                 └─ get-reply-run.ts（执行前最后组装）
                      └─ agent-runner.ts（实际Agent运行）
                           └─ route-reply / dispatcher（回复下发）
```

---

## 第一站：dispatch.ts —— 调度入口，流程控制

**文件：** `src/auto-reply/dispatch.ts`

这是整条流水线的"大门"。它的核心职责是**创建 Dispatcher 并保证资源释放**。

```typescript
// 关键函数 dispatchInboundMessageWithBufferedDispatcher
const { dispatcher, replyOptions, markDispatchIdle } = createReplyDispatcherWithTyping(
  params.dispatcherOptions,
);
try {
  return await dispatchInboundMessage({ ... });
} finally {
  markDispatchIdle(); // 保证 dispatcher 状态被清理
}
```

### 关键设计点

1. **`withReplyDispatcher` 模式** —— 不管成功/异常/中断，`finally` 里一定会调用 `markComplete()` + `waitForIdle()`。这保证：
   - 预留的资源被释放（typing indicator 不会再转）
   - 不会因为异常导致状态卡死

2. **Typing 控制** —— Dispatcher 支持 `block`（阻止用户继续发消息）、`final`（发送最终回复）等模式，确保回复过程中 UI 状态正确。

3. **跨通道识别** —— 判断 `OriginatingChannel` 和当前 `Surface` 是否不同，如果不同就知道这是一个"跨通道"的场景（比如 Telegram 消息触发了一个共享 session 的 Slack 回复），需要走 `routeReply` 而不是本地 dispatcher。

---

## 第二站：dispatch-from-config.ts —— 消息编排与去重

**文件：** `src/auto-reply/reply/dispatch-from-config.ts:120`

这里做了**消息进入 Agent 前的所有准备工作**，包括去重、插件路由、TTS 处理等。

### 2.1 去重（避免重复回复同一消息）

```typescript
// dispatch-from-config.ts:181
if (shouldSkipDuplicateInbound(ctx)) {
  recordProcessed("skipped", { reason: "duplicate" });
  return { queuedFinal: false, counts: dispatcher.getQueuedCounts() };
}
```

消息可能通过网络重试等原因重复发送，系统用 `MessageSid` 之类的事件 ID 做去重。如果已经处理过，直接跳过。

### 2.2 插件绑定路由（Plugin-bound sessions）

```typescript
// dispatch-from-config.ts:322
if (pluginOwnedBinding) {
  const targetedClaimOutcome = hookRunner?.runInboundClaimForPluginOutcome(...);
  switch (targetedClaimOutcome.status) {
    case "handled": return ... // 插件处理了
    case "missing_plugin":
    case "no_handler": // 插件无法处理，降级回普通流程
      pluginFallbackReason = ...
      break;
    case "declined": // 插件拒绝，发通知
      await sendBindingNotice(..., "terminal");
      return ...
    case "error": // 插件出错，发错误通知
      ...
  }
}
```

有些 session 是插件所有的（比如 WhatsApp web 插件会"认领"某些会话）。如果插件：
- **handled**：插件已经处理完，直接返回
- **missing_plugin / no_handler**：插件找不到或没有 handler，降级回普通流程
- **declined**：插件拒绝，回调发送方收到通知
- **error**：插件出错，也发通知

### 2.3 消息接收钩子（message_received hooks）

```typescript
// dispatch-from-config.ts:391
if (hookRunner?.hasHooks("message_received")) {
  fireAndForgetHook(
    hookRunner.runMessageReceived(toPluginMessageReceivedEvent(hookContext), ...),
    "dispatch-from-config: message_received plugin hook failed"
  );
}
```

这是一个**异步通知机制**——插件可以注册 `message_received` 钩子，当消息进来时会收到通知。但这是 "fire-and-forget" 的（不等待结果，不阻塞主流程），所以插件的处理不会影响消息处理的延迟。

### 2.4 快速中断（Fast abort）

```typescript
// dispatch-from-config.ts:417
const fastAbort = await tryFastAbortFromMessage({ ctx, cfg });
if (fastAbort.handled) {
  const payload = { text: formatAbortReplyText(fastAbort.stoppedSubagents) };
  if (shouldRouteToOriginating) {
    await routeReply({ payload, ... }); // 跨通道
  } else {
    dispatcher.sendFinalReply(payload); // 同通道
  }
  return ...
}
```

如果用户发送了 `/stop` 这样的控制命令，系统可以快速中止正在运行的 subagent，而不需要等到 Agent 完全启动。

### 2.5 回复分派回调（onToolResult / onBlockReply）

```typescript
// dispatch-from-config.ts:551
onToolResult: (payload: ReplyPayload) => {
  const ttsPayload = await maybeApplyTtsToPayload({ payload, kind: "tool", ... });
  if (shouldRouteToOriginating) {
    await sendPayloadAsync(ttsPayload); // 跨通道走 routeReply
  } else {
    dispatcher.sendToolResult(ttsPayload); // 同通道走 dispatcher
  }
},
onBlockReply: (payload: ReplyPayload, context) => {
  // 流式块回调，累积文本用于后续 TTS
  if (payload.text) accumulatedBlockText += "\n" + payload.text;
  // ...发送
}
```

这里注册了三个回调：
- **`onToolResult`**：当 Agent 执行工具（如 bash 命令）完成时调用
- **`onBlockReply`**：流式回复的每个"块"（streaming token）到达时调用
- 这些回调也负责 TTS（文字转语音）的应用

### 2.6 TTS 自动应用

```typescript
// dispatch-from-config.ts:553
const ttsPayload = await maybeApplyTtsToPayload({
  payload,
  cfg,
  channel: ttsChannel,
  kind: "tool" | "block" | "final",
  inboundAudio,
  ttsAuto: sessionTtsAuto,
});
```

`maybeApplyTtsToPayload` 会根据会话的 TTS 配置（`sessionTtsAuto`）和入站音频上下文，自动把生成的文本转换成语音数据 `mediaUrl`。

---

## 第三站：get-reply.ts —— 决策与上下文构建

**文件：** `src/auto-reply/reply/get-reply.ts:57`

这是流水线的"大脑"——它决定了**用哪个模型、用什么配置、做什么预处理**。

### 3.1 解析路由，找到 agent 和 session

```typescript
// get-reply.ts:64
const targetSessionKey = ctx.CommandSource === "native"
  ? ctx.CommandTargetSessionKey?.trim()
  : undefined;
const agentSessionKey = targetSessionKey || ctx.SessionKey;
const agentId = resolveSessionAgentId({ sessionKey: agentSessionKey, config: cfg });
```

根据 `SessionKey` 找到对应的 agent ID。

### 3.2 媒体理解和链接预处理

```typescript
// get-reply.ts:128
if (!isFastTestEnv) {
  await applyMediaUnderstanding({ ctx: finalized, cfg, agentDir, activeModel: { provider, model } });
  await applyLinkUnderstanding({ ctx: finalized, cfg });
}
```

在消息进入 Agent 之前：
- **`applyMediaUnderstanding`**：如果用户发了图片/音频，用模型做理解，把理解结果附加到消息上
- **`applyLinkUnderstanding`**：抓取 URL 的 OpenGraph 信息，让 Agent "看到"链接内容

### 3.3 初始化会话状态

```typescript
// get-reply.ts:152
const sessionState = await initSessionState({ ctx: finalized, cfg, commandAuthorized });
```

这里加载或创建会话条目（`SessionEntry`），包括：
- session 文件路径
- 新会话还是已有会话
- 之前的消息历史

### 3.4 解析指令（Directives）

```typescript
// get-reply.ts:222
const directiveResult = await resolveReplyDirectives({ ... });
if (directiveResult.kind === "reply") {
  return directiveResult.reply; // 有些指令会直接返回回复，不需要进Agent
}
```

指令解析识别消息中的内联命令，比如：
- `/think high` → 改变思考层级
- `/model gpt-4` → 切换模型
- `/verbose on` → 开启详细输出
- `/queue interrupt` → 中断当前队列

### 3.5 处理内联动作（Inline actions）

```typescript
// get-reply.ts:305
const inlineActionResult = await handleInlineActions({ ... });
if (inlineActionResult.kind === "reply") {
  return inlineActionResult.reply; // 某些内联动作（如切换模型）会直接返回
}
```

内联动作包括：
- 模型切换（`@gpt-4` 这样的 mention）
- Skill 调用（`/skill` 命令）
- 状态报告请求（`/status`）

### 3.6 最终走到 Agent

```typescript
// get-reply.ts:361
return runPreparedReply({
  ctx, sessionCtx, cfg, agentId, agentDir, agentCfg, sessionCfg,
  commandAuthorized, command, commandSource, allowTextCommands, directives,
  resolvedThinkLevel, resolvedVerboseLevel, ... // 大量参数
});
```

把前面所有解析、决策的结果，全部汇聚成一个巨大的参数对象，传递给 `runPreparedReply`。

---

## 第四站：get-reply-run.ts —— 执行前的最后组装

**文件：** `src/auto-reply/reply/get-reply-run.ts:182`

这是**执行前的最后准备工序**——把之前收集的所有信息拼成最终给 Agent 的"提示词"。

### 4.1 群聊 Intro 注入

```typescript
// get-reply-run.ts:252
const shouldInjectGroupIntro = Boolean(
  isGroupChat && (isFirstTurnInSession || sessionEntry?.groupActivationNeedsSystemIntro)
);
const groupIntro = shouldInjectGroupIntro
  ? buildGroupIntro({ cfg, sessionCtx, sessionEntry, defaultActivation, ... })
  : "";
```

首次进入群聊时，注入行为说明（激活模式、潜伏模式等）。

### 4.2 处理 /new 和 /reset（会话重置）

```typescript
// get-reply-run.ts:290
const isBareNewOrReset = rawBodyTrimmed === "/new" || rawBodyTrimmed === "/reset";
const isBareSessionReset = isNewSession && (emptyTriggerBody || isBareNewOrReset);
const baseBodyFinal = isBareSessionReset ? buildBareSessionResetPrompt(cfg) : baseBody;
```

用户发送 `/new` 或 `/reset` 时，会生成一个特殊的重置提示，而不是把 `/new` 当作普通消息发给 Agent。

### 4.3 思考层级 Hint 提取

```typescript
// get-reply-run.ts:339
if (!resolvedThinkLevel && prefixedBodyBase) {
  const parts = prefixedBodyBase.split(/\s+/);
  const maybeLevel = normalizeThinkLevel(parts[0]);
  if (maybeLevel && (maybeLevel !== "xhigh" || supportsXHighThinking(provider, model))) {
    resolvedThinkLevel = maybeLevel;
    prefixedBodyBase = parts.slice(1).join(" ").trim(); // 从消息中剥离这个hint
  }
}
```

用户在消息开头写 `low` / `medium` / `high` / `xhigh` 这样的词，会被提取出来作为思考层级配置，然后从消息体里去掉（避免干扰 Agent）。

### 4.4 Skill 快照

```typescript
// get-reply-run.ts:368
const skillResult = await ensureSkillSnapshot({ ... });
sessionEntry = skillResult.sessionEntry ?? sessionEntry;
currentSystemSent = skillResult.systemSent;
```

确保 Agent 的 skill 定义在此时被快照化，避免在 long-running 会话中途 skill 定义变了导致不一致。

### 4.5 队列策略处理

```typescript
// get-reply-run.ts:439
const resolvedQueue = resolveQueueSettings({ cfg, channel: sessionCtx.Provider, ... });
// interrupt / steer / followup / collect 等模式

if (resolvedQueue.mode === "interrupt" && laneSize > 0) {
  const cleared = clearCommandLane(sessionLaneKey);
  const aborted = abortEmbeddedPiRun(sessionIdFinal);
  // 打断当前运行的消息
}
```

队列控制逻辑：
- **`interrupt`**：清空队列 + 中止当前运行，处理新消息
- **`steer`**：把新消息注入当前运行的 Agent（改变方向）
- **`followup`**：把新消息加入队列，等当前运行完成后执行
- **`collect`**：同 followup，但多用于"批量收集"

### 4.6 组装 FollowupRun

```typescript
// get-reply-run.ts:472
const followupRun = {
  prompt: queuedBody,
  messageId: sessionCtx.MessageSidFull ?? sessionCtx.MessageSid,
  summaryLine: baseBodyTrimmedRaw,
  enqueuedAt: Date.now(),
  originatingChannel: ctx.OriginatingChannel,
  run: {
    agentId, agentDir, sessionId, sessionKey, provider, model,
    thinkLevel: resolvedThinkLevel, fastMode: ..., verboseLevel: ...,
    extraSystemPrompt: extraSystemPromptParts.join("\n\n"),
    ...
  }
};
```

这是给 `runReplyAgent` 的核心输入——包含：
- **prompt**：最终的消息内容
- **originatingChannel/to**：跨通道回复需要用到
- **run config**：模型、思考层级、workspace 配置等

---

## 第五站：agent-runner.ts —— Agent 实际执行

**文件：** `src/auto-reply/reply/agent-runner.ts:63`

这是真正调用 AI 模型执行的地方。

### 5.1 队列入口决策

```typescript
// agent-runner.ts:206
const activeRunQueueAction = resolveActiveRunQueueAction({
  isActive, isHeartbeat, shouldFollowup, queueMode: resolvedQueue.mode,
});
// "drop" | "enqueue-followup" | "run"

if (activeRunQueueAction === "drop") {
  typing.cleanup();
  return undefined; // 队列满了，丢弃
}
if (activeRunQueueAction === "enqueue-followup") {
  enqueueFollowupRun(queueKey, followupRun, resolvedQueue);
  return undefined; // 入队，不阻塞
}
```

在真正运行之前，再检查一次队列状态。如果有人在队列前面，就乖乖排队。

### 5.2 Agent 运行与 Fallback

```typescript
// agent-runner.ts:347
const runOutcome = await runAgentTurnWithFallback({ ... });

if (runOutcome.kind === "final") {
  return finalizeWithFollowup(runOutcome.payload, queueKey, runFollowupTurn);
}
// fallback 逻辑...
```

`runAgentTurnWithFallback` 尝试用配置的模型运行 Agent，如果失败（比如 API 限流），会尝试备用模型。fallback 的结果会被记录到 session，用于后续诊断。

### 5.3 回复构建与后处理

```typescript
// agent-runner.ts:488
const payloadResult = await buildReplyPayloads({ payloads, ... });
// 处理媒体路径规范化、messaging tool 结果等

// TTS + verbose notices + usage line 注入
if (verboseEnabled && activeIsNewSession) {
  finalPayloads.unshift({ text: `🧭 New session: ${followupRun.run.sessionId}` });
}
if (responseUsageLine) {
  finalPayloads = appendUsageLine(finalPayloads, responseUsageLine);
}
```

构建最终回复时：
- 规范化媒体路径（workspace 里的相对路径 → 实际 URL）
- 添加 verbose 信息（新 session ID、fallback 说明、自动压缩完成）
- 添加 usage 信息（token 消耗、费用估算）
- 检查是否有未兑现的 cron 提醒

### 5.4 Followup 队列处理

```typescript
// agent-runner.ts:372
return finalizeWithFollowup(runOutcome.payload, queueKey, runFollowupTurn);
```

`finalizeWithFollowup` 会把这次运行的"结果"和"队列里的后续任务"连接起来。如果有 followup 任务，它们会在当前回复发出后自动触发。

---

## 第六站：route-reply —— 跨通道回复下发

**文件：** `src/auto-reply/reply/route-reply.ts:76`

当消息的 `OriginatingChannel` 与当前处理的 channel 不同时（比如 Telegram 触发的任务要回复到 Slack），就走 `routeReply`。

```typescript
// route-reply.ts:76
export async function routeReply(params: RouteReplyParams): Promise<RouteReplyResult> {
  const { payload, channel, to, accountId, threadId, cfg, abortSignal } = params;
  const normalizedChannel = normalizeMessageChannel(channel);
  const plugin = channelId ? getChannelPlugin(channelId) : undefined;
  // ...resolve reply transport / thread info...

  const { deliverOutboundPayloads } = await loadDeliverRuntime();
  const results = await deliverOutboundPayloads({ ... });
  return { ok: true, messageId: last?.messageId };
}
```

核心逻辑：
1. 根据 channel 类型找到对应的 channel plugin
2. 解析 thread 上下文（某些 channel 如 Telegram 需要 topic ID）
3. 调用 `deliverOutboundPayloads`（延迟加载，避免不用 channel 也加载所有依赖）
4. 支持 `mirror`：把发送的消息内容同步记录到 session transcript

---

## 完整流程示意图

```
用户发消息
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ dispatch.ts: dispatchInboundMessageWithBufferedDispatcher │
│  • 创建 ReplyDispatcher                               │
│  • 保证 finally 里 markComplete + waitForIdle          │
└────────────────────────┬────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────┐
│ dispatch-from-config.ts: dispatchReplyFromConfig     │
│  • 去重（shouldSkipDuplicateInbound）                 │
│  • 插件绑定路由（plugin-bound sessions）              │
│  • message_received 钩子（异步通知）                 │
│  • 快速中断（/stop 命令）                            │
│  • 注册 onToolResult / onBlockReply / onFinalReply    │
│  • TTS 自动应用（maybeApplyTtsToPayload）            │
│  • 判断 shouldRouteToOriginating（跨通道？）         │
└────────────────────────┬────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────┐
│ get-reply.ts: getReplyFromConfig                     │
│  • 解析路由 → agentId / sessionKey                   │
│  • 媒体理解 + 链接理解（applyMedia/LinkUnderstanding）│
│  • initSessionState（加载/创建会话）                 │
│  • resolveReplyDirectives（解析 /think /model 等）    │
│  • handleInlineActions（内联命令处理）               │
│  • → runPreparedReply()                              │
└────────────────────────┬────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────┐
│ get-reply-run.ts: runPreparedReply                   │
│  • 群聊 Intro 注入                                   │
│  • /new /reset 会话重置处理                          │
│  • 提取思考层级 Hint（low/high/xhigh）                │
│  • ensureSkillSnapshot（skill 版本快照）             │
│  • 队列策略处理（interrupt/steer/followup）          │
│  • 组装 followupRun 对象                             │
│  • → runReplyAgent()                                 │
└────────────────────────┬────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────┐
│ agent-runner.ts: runReplyAgent                       │
│  • 队列入口决策（drop/enqueue/run）                  │
│  • runAgentTurnWithFallback（模型调用 + fallback）   │
│  • buildReplyPayloads（回复构建 + 媒体路径规范化）   │
│  • verbose notices + usage line 注入                 │
│  • finalizeWithFollowup（衔接后续队列任务）         │
└────────────────────────┬────────────────────────────┘
                         ▼
         ┌────────────────┴────────────────┐
         │  同通道 → dispatcher.sendFinalReply()  │
         │  跨通道 → routeReply() (OriginatingChannel) │
         └───────────────────────────────────────┘
```

---

## 关键设计模式总结

| 设计 | 位置 | 作用 |
|------|------|------|
| **finally 资源释放** | `withReplyDispatcher` | 保证 typing/阻塞状态在所有出口被清理 |
| **去重守卫** | `dispatch-from-config.ts` | 防止重复消息导致重复回复 |
| **跨通道路由** | `shouldRouteToOriginating` | 共享 session 跨 provider 场景下的正确路由 |
| **Fire-and-forget 钩子** | `message_received` | 插件通知不阻塞主流程 |
| **流式回调累积 TTS** | `onBlockReply` 累积文本 | 当流式成功但无最终回复时，用累积文本生成 TTS |
| **指令直接回复** | `directiveResult.kind === "reply"` | `/stop` 等命令不需要进 Agent |
| **队列状态机** | `resolveActiveRunQueueAction` | interrupt/steer/followup/collect 多策略协调 |
| **Fallback 透明切换** | `runAgentTurnWithFallback` | 主模型失败自动切备用，对用户透明 |
| **Skill 快照** | `ensureSkillSnapshot` | 防止 long-running 会话中途 skill 定义变化 |
| **Verbose/Usage 注入** | agent-runner.ts 后处理 | 运营信息对用户可见但不干扰核心回复 |

这些设计让 OpenClaw 能够：**同时服务多个 channel、正确处理并发和队列、保持会话状态一致性、让 AI 模型切换和 fallback 对用户透明**。