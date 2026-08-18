# 流式订阅与回复拼装详解

> 目标：拆解模型流式事件如何从原始 SSE 转变为用户最终收到的 payload，以及 block streaming（分块推送）与最终消息的去重逻辑。

---

## 一、核心模块与文件概览

| 文件 | 职责 |
|------|------|
| `src/agents/pi-embedded-subscribe.ts` | 订阅入口，构建完整的 context 和状态机 |
| `src/agents/pi-embedded-subscribe.handlers.ts` | 事件路由 switch，根据事件类型分发到具体 handler |
| `src/agents/pi-embedded-subscribe.handlers.messages.ts` | 文本流处理（`message_start/update/end`） |
| `src/agents/pi-embedded-subscribe.handlers.tools.ts` | 工具事件处理（`tool_execution_start/error` 等） |
| `src/agents/pi-embedded-block-chunker.ts` | 文本分块缓冲，按配置策略将长文本切分为块 |
| `src/auto-reply/reply/block-reply-pipeline.ts` | block 推送管道，负责发送、coalescing 和去重 |
| `src/auto-reply/reply/block-reply-coalescer.ts` | 小块文本合并器，将多个小块合并后一起发送 |
| `src/auto-reply/reply/agent-runner-payloads.ts` | 最终 payload 过滤，从流式发送的 block 中去除已发内容 |
| `src/auto-reply/reply/reply-delivery.ts` | block reply 发送的编排逻辑 |

---

## 二、订阅状态（EmbeddedPiSubscribeState）

状态定义在 `pi-embedded-subscribe.ts:38-82`，是整个流式处理的核心数据存储。

```typescript
const state: EmbeddedPiSubscribeState = {
  // ── 文本累积 ───────────────────────────────
  assistantTexts: [],           // 最终确认的文本片段列表（用于最终 payload）
  toolMetas: [],                // 工具调用摘要列表
  toolMetaById: new Map(),      // toolCallId → 摘要（快速查找）
  toolSummaryById: new Set(),   // 已发送的工具摘要 ID（去重）

  // ── 缓冲区 ─────────────────────────────────
  deltaBuffer: "",              // 单条消息的文本增量缓冲（用于单调追加判断）
  blockBuffer: "",              // 非分块模式的回复缓冲（直接累积）

  // ── 分块状态 ───────────────────────────────
  blockState: { thinking: false, final: false, inlineCode: createInlineCodeState() },
  partialBlockState: { thinking: false, final: false, inlineCode: createInlineCodeState() },
  lastStreamedAssistant: undefined,
  lastStreamedAssistantCleaned: undefined,
  emittedAssistantUpdate: false,
  lastBlockReplyText: undefined,  // 上一次发出的 block reply 文本（去重）
  suppressBlockChunks: false,     // 避免最终文本合并后 Late chunk 插入

  // ── blockReplyBreak 控制点 ──────────────────
  blockReplyBreak: params.blockReplyBreak ?? "text_end",
  //   - "text_end": 每个 text_delta/text_end 事件后触发 flush
  //   - "message_end": 只在整条消息结束时 flush

  // ── Reasoning 相关 ──────────────────────────
  reasoningMode: params.reasoningMode ?? "off",
  includeReasoning: reasoningMode === "on",
  streamReasoning: reasoningMode === "stream" && typeof params.onReasoningStream === "function",
  reasoningStreamOpen: false,
  lastReasoningSent: undefined,

  // ── 辅助追踪 ───────────────────────────────
  assistantMessageIndex: 0,           // 当前是第几条 assistant 消息
  lastAssistantTextMessageIndex: -1,  // 上一条 assistant 消息的 index（去重）
  lastAssistantTextNormalized: undefined,
  lastAssistantTextTrimmed: undefined,
  assistantTextBaseline: 0,           // 用于追踪本轮新增的文本

  // ── 压缩重试 ───────────────────────────────
  compactionInFlight: false,
  pendingCompactionRetry: 0,
  compactionRetryPromise: null,
  unsubscribed: false,

  // ── 消息工具去重 ────────────────────────────
  messagingToolSentTexts: [],              // 通过消息工具已发送的文本
  messagingToolSentTextsNormalized: [],    // 规范化后的已发文本
  messagingToolSentTargets: [],            // 已发消息的目标（跨目标不去重）
  messagingToolSentMediaUrls: [],
  pendingMessagingTexts: new Map(),        // 待确认的发送（工具失败时回退）
  pendingMessagingTargets: new Map(),
  pendingMessagingMediaUrls: new Map(),
};
```

**关键概念区分**：

- `deltaBuffer` vs `blockBuffer`：前者用于"单调追加"策略（判断 provider 是否重发），后者用于实际推送
- `assistantTexts` vs `blockBuffer`：前者是 `message_end` 后确认的最终文本，后者是流式过程中的中间态
- `lastBlockReplyText`：防止同一个 chunk 被 emit 两次（去重）

---

## 三、事件路由（Event Switch）

`pi-embedded-subscribe.handlers.ts` 中的 `createEmbeddedPiSessionEventHandler` 是 SSE 事件的入口分发器：

```typescript
// pi-embedded-subscribe.handlers.ts
export function createEmbeddedPiSessionEventHandler(ctx: EmbeddedPiSubscribeContext) {
  return (evt: EmbeddedPiSubscribeEvent) => {
    switch (evt.type) {
      case "message_start":
        handleMessageStart(ctx, evt as never);
        return;
      case "message_update":
        handleMessageUpdate(ctx, evt as never);
        return;
      case "message_end":
        handleMessageEnd(ctx, evt as never);
        return;
      case "tool_execution_start":
        // 异步 fire-and-forget，打字指示器等副作用，不阻塞工具摘要
        handleToolExecutionStart(ctx, evt as never).catch((err) => {
          ctx.log.debug(`tool_execution_start handler failed: ${String(err)}`);
        });
        return;
    }
  };
}
```

**关键设计决策**：

1. **`tool_execution_start` 是异步 fire-and-forget**：`handleToolExecutionStart` 返回 `Promise`，但调用方 `.catch()` 只记 debug 日志，不冒泡。这确保工具执行的副作用（打字指示器等）不会阻塞工具摘要的显示。

2. **`message_start/update/end` 是同步处理**：这三条消息有严格的数据依赖关系，必须按顺序执行。

3. **其他事件（如 `tool_execution_end`, `error`）默认不处理**：代码只显式处理上述四种事件，未匹配的事件被静默忽略。

---

## 四、文本流处理（handleMessageUpdate）

`pi-embedded-subscribe.handlers.messages.ts` 处理 `message_update` 事件，这是 SSE 流中最频繁的事件。

### 4.1 事件类型过滤

```typescript
// handlers.messages.ts
if (evtType !== "text_delta" && evtType !== "text_start" && evtType !== "text_end") {
  return;
}
```

只有 `text_delta`、`text_start`、`text_end` 三种子事件会触发文本处理逻辑。

### 4.2 单调追加策略（Monotonic Append）

这是整个流式处理中最精妙的部分。代码注释解释了原因：

```typescript
// KNOWN: Some providers resend full content on text_end.
// We only append a suffix (or nothing) to keep output monotonic.
```

**问题**：部分 provider（如某些 OpenAI 兼容接口）在 `text_end` 事件中重发完整内容，而不是只发增量。这会导致重复输出。

**解决方案**：单调追加策略（`pi-embedded-subscribe.handlers.messages.ts:55-75`）：

```typescript
let chunk = "";
if (evtType === "text_delta") {
  chunk = delta;  // 增量，直接追加
} else if (evtType === "text_start" || evtType === "text_end") {
  if (delta) {
    chunk = delta;  // 有 delta 就用 delta
  } else if (content) {
    // content 是完整内容（某些 provider 在 text_end 时重发）
    // 通过前缀匹配判断增量
    if (content.startsWith(ctx.state.deltaBuffer)) {
      // 服务端发的完整内容 our deltaBuffer 是其前缀 → 只追加 suffix
      chunk = content.slice(ctx.state.deltaBuffer.length);
    } else if (ctx.state.deltaBuffer.startsWith(content)) {
      // our deltaBuffer 以 content 为前缀 → 服务端返回的是前缀，忽略
      chunk = "";
    } else if (!ctx.state.deltaBuffer.includes(content)) {
      // 全新内容（不应该发生），直接追加
      chunk = content;
    }
    // 如果都不满足，chunk = ""，不追加
  }
}

if (chunk) {
  ctx.state.deltaBuffer += chunk;  // 更新 deltaBuffer
  if (ctx.blockChunker) {
    ctx.blockChunker.append(chunk);  // 分块模式：交给 chunker
  } else {
    ctx.state.blockBuffer += chunk;  // 非分块模式：直接累积
  }
}
```

**图示**：

```
Provider 发 text_end，内容 = "Hello world"
  deltaBuffer = "Hello"（之前 text_delta 已累积）
  content = "Hello world"
  content.startsWith(deltaBuffer) → true
  chunk = " world"  （只追加增量）

Provider 发 text_end，内容 = "Hello world"
  deltaBuffer = "Hello world"
  content = "Hello world"
  deltaBuffer.startsWith(content) → true
  chunk = ""  （没有新增内容，忽略）
```

### 4.3 区块标签剥离（stripBlockTags）

在累积文本的同时，系统会解析 `<think>`（思考块）和 `<final>`（最终回复块）标签：

```typescript
// pi-embedded-subscribe.ts:368-456
const stripBlockTags = (text: string, state: { thinking: boolean; final: boolean; inlineCode: InlineCodeState }) => {
  // 1. 处理 <think> 块（状态ful 跨越 chunk 边界）
  //    - 进入 <think> 时设置 inThinking = true，丢弃内容
  //    - 退出 <think> 时设置 inThinking = false，恢复累积
  //    - state.thinking 跨调用保持状态

  // 2. 处理 <final> 块（严格模式）
  //    - enforceFinalTag = true：只返回 <final>...</final> 内部的内容
  //    - enforceFinalTag = false：剥离标签但保留全部内容
  //    - 如果没看到 <final> 标签，返回空字符串（防止泄漏"思考过程"）
};
```

**`<final>` 严格模式的必要性**：某些模型（如 Minimax）可能在 `<final>` 标签外输出"思考过程"（如 "**Locating Manulife**..."），严格模式确保这些内容不会泄漏给用户。

### 4.4 emitBlockChunk（推送一个文本块）

累积到足够文本后，通过 `emitBlockChunk` 推送给用户：

```typescript
// pi-embedded-subscribe.ts:478-534
const emitBlockChunk = (text: string) => {
  if (state.suppressBlockChunks) return;  // 最终文本合并后禁止 Late chunk

  // 1. 剥离 <think> 和 <final> 标签，降级工具调用文本
  const chunk = stripDowngradedToolCallText(
    stripBlockTags(text, state.blockState)
  ).trimEnd();

  if (!chunk || chunk === state.lastBlockReplyText) return;  // 空或重复检查

  // 2. 检查是否已通过消息工具发送过（避免重复）
  const normalizedChunk = normalizeTextForComparison(chunk);
  if (isMessagingToolDuplicateNormalized(normalizedChunk, messagingToolSentTextsNormalized)) return;

  // 3. 检查是否重复的 assistant text
  if (shouldSkipAssistantText(chunk)) return;

  state.lastBlockReplyText = chunk;
  assistantTexts.push(chunk);  // 累积到最终 payload 列表
  rememberAssistantText(chunk);

  if (!params.onBlockReply) return;  // 无回调则只累积

  // 4. 解析回复指令（replyToId、replyToTag、audioAsVoice 等）
  const splitResult = replyDirectiveAccumulator.consume(chunk);
  if (!splitResult) return;

  // 5. 安全地调用 onBlockReply（捕获异常，不影响主流程）
  emitBlockReplySafely({
    text: splitResult.text,
    mediaUrls: splitResult.mediaUrls,
    audioAsVoice: splitResult.audioAsVoice,
    replyToId: splitResult.replyToId,
    replyToTag: splitResult.replyToTag,
    replyToCurrent: splitResult.replyToCurrent,
  });
};
```

---

## 五、EmbeddedBlockChunker（文本分块缓冲）

`pi-embedded-block-chunker.ts` 负责将长文本按配置策略切分为"合理的块"。

### 5.1 分块配置

```typescript
export type BlockReplyChunking = {
  minChars: number;           // 最小累积字符数才触发 flush
  maxChars: number;           // 最大单块字符数（超过则强制切分）
  breakPreference?: "paragraph" | "newline" | "sentence";
  flushOnParagraph?: boolean; // 在 \n\n 段落边界提前 flush
};
```

### 5.2 分块策略优先级

```typescript
// pickBreakIndex 逻辑：
// 1. 如果是段落偏好，先找 \n\n 段落边界（安全断点）
// 2. 否则找 \n 换行符边界
// 3. 否则找句子边界 [.!?]
// 4. 如果 force=true，直接在 maxChars 处硬切
// 5. 硬切时，如果正好在代码围栏内，关闭 + 重新打开围栏（保持 Markdown 有效）
```

### 5.3 围栏保护（Fence Safety）

**关键设计**：不能在 Markdown 代码围栏（``` ``` ```）中间切分，否则 UI 渲染会出问题。

```typescript
// EmbeddedBlockChunker 在 pickBreakIndex 中检查：
if (isSafeFenceBreak(fenceSpans, offset + i)) {
  return { index: i };  // i 是安全断点
}

// 如果 maxChars 处正好在围栏内：
const fence = findFenceSpanAt(fenceSpans, offset + maxChars);
if (fence) {
  return {
    index: maxChars,
    fenceSplit: {
      closeFenceLine: `${fence.indent}${fence.marker}`,  // 关闭围栏
      reopenFenceLine: fence.openLine,                  // 重新打开
      fence,
    },
  };
}
```

**结果**：发送的 chunk 会变成 `...code\n```\n```重新打开的围栏内容`，确保 UI 渲染正确。

### 5.4 drain 方法（释放缓冲）

```typescript
drain(params: { force: boolean; emit: (chunk: string) => void }) {
  // force = true：强制释放所有缓冲（如 message_end 时）
  // force = false：按分块策略释放（如 minChars 达到时）

  // 循环切分，直到 buffer 耗尽
  while (start < source.length) {
    const breakResult = this.#pickBreakIndex(view, fenceSpans, ...);
    if (breakResult.index <= 0) { /* 没法切分 */ }
    // emit 一个 chunk，可能带 fenceSplit
    this.#emitBreakResult({ ... });
  }
}
```

---

## 六、BlockReplyPipeline（Block 推送管道）

`block-reply-pipeline.ts` 是 block 推送的发送层，负责发送、coalescing（合并）和去重。

### 6.1 核心接口

```typescript
export type BlockReplyPipeline = {
  enqueue: (payload: ReplyPayload) => void;      // 入队（可能触发 coalescer 缓冲）
  flush: (options?: { force?: boolean }) => Promise<void>;  // 强制刷新
  stop: () => void;                              // 停止接受新 payload
  hasBuffered: () => boolean;                    // 是否有待发 payload
  didStream: () => boolean;                      // 是否已流式发送过内容
  isAborted: () => boolean;                      // 是否已中止（超时）
  hasSentPayload: (payload: ReplyPayload) => boolean;  // 去重检查
};
```

### 6.2 发送链路（sendChain）

Pipeline 内部维护一个 `sendChain: Promise<void>`，所有发送请求串行执行：

```typescript
let sendChain: Promise<void> = Promise.resolve();

const sendPayload = (payload: ReplyPayload, bypassSeenCheck: boolean = false) => {
  // ...检查 seenKeys/sentKeys/pendingKeys...
  pendingKeys.add(payloadKey);
  sendChain = sendChain
    .then(async () => {
      await withTimeout(onBlockReply(payload, { abortSignal, timeoutMs }), timeoutMs, timeoutError);
      return true;  // 发送成功
    })
    .then((didSend) => {
      if (didSend) {
        sentKeys.add(payloadKey);           // 记录已发送（用于 hasSentPayload）
        sentContentKeys.add(contentKey);    // 内容 key（忽略 replyToId）
        didStream = true;
      }
    })
    .finally(() => {
      pendingKeys.delete(payloadKey);
    });
};
```

**为什么用 sendChain 链式执行？** 确保多个 block 按顺序发送，不会出现乱序。`Promise.race` + `sendChain` 保证新 payload 排在已有 payload 之后。

### 6.3 三种 Key 的设计

Pipeline 内部维护三套 Set 用于不同目的的去重：

```typescript
const seenKeys = new Set<string>();       // 瞬时去重（同一批次内）
const sentKeys = new Set<string>();       // 已确认发送（payloadKey，含 replyToId）
const sentContentKeys = new Set<string>(); // 已确认发送（contentKey，不含 replyToId）
const pendingKeys = new Set<string>();     // 正在发送中
const bufferedKeys = new Set<string>();    // coalescer 缓冲中
const bufferedPayloadKeys = new Set<string>();  // 缓冲 buffer 中
```

**两种 Key 的区别**：

```typescript
// payloadKey：区分 replyToId（同一个内容回复不同消息 = 不同 key）
createBlockReplyPayloadKey = JSON.stringify({ text, mediaList, replyToId })

// contentKey：不区分 replyToId（流式线程消息和最终消息内容相同则去重）
createBlockReplyContentKey = JSON.stringify({ text, mediaList })
```

**设计意图**：
- `sentKeys` + `pendingKeys`：防止同一 payload 被重复 enqueue 或重复发送
- `sentContentKeys`：用于 `hasSentPayload`——流式发送的线程消息和最终 payload 内容相同时，最终 payload 应该被过滤

### 6.4 Coalescer（合并器）

Coalescer 负责将多个小 payload 合并为一个，减少网络往返：

```typescript
// block-reply-coalescer.ts
const enqueue = (payload: ReplyPayload) => {
  // flushOnEnqueue = true（chunkMode="newline"）时，每个 payload 单独 flush
  if (flushOnEnqueue) {
    void flush({ force: true });
    bufferText = text;
    void flush({ force: true });
    return;
  }

  // 正常合并：追加到 bufferText，直到超过 maxChars 才 flush
  const nextText = bufferText ? `${bufferText}${joiner}${text}` : text;
  if (nextText.length > maxChars) {
    void flush({ force: true });
    // 如果剩余文本仍然超过 maxChars，直接发送这个 payload
  }
  bufferText = nextText;

  // 空闲计时器：超过 idleMs 没新内容就自动 flush
  scheduleIdleFlush();
};
```

**Coalescer 的 idleMs**：当用户在打字时，模型可能分很多小 chunk 发送文本。Coalescer 会等待 `idleMs` 毫秒，如果没新内容才 flush，减少碎片化。

### 6.5 Buffer（特殊缓冲策略）

Pipeline 支持插入自定义 Buffer：

```typescript
// createAudioAsVoiceBuffer：音频消息特殊处理
// 如果任何入队的 payload 有 audioAsVoice=true，最终 flush 的所有 payload 都要带这个标志
```

---

## 七、去重机制（双路策略）

Block streaming 和最终 payload 之间可能产生重复——工具执行前 flush 的文本，既通过流式提前发给了用户，又出现在最终的 payload 中。

### 7.1 场景 A：有 BlockReplyPipeline

流式通过 Pipeline 发送，最终通过 `hasSentPayload` 过滤：

```typescript
// agent-runner-payloads.ts:208-213
const shouldDropFinalPayloads =
  params.blockStreamingEnabled &&
  Boolean(params.blockReplyPipeline?.didStream()) &&
  !params.blockReplyPipeline?.isAborted();

const filteredPayloads = shouldDropFinalPayloads
  ? []  // 流式已完全覆盖，不发最终 payload
  : mediaFilteredPayloads.filter(
      (payload) => !params.blockReplyPipeline?.hasSentPayload(payload),
    );
```

### 7.2 场景 B：blockStreaming 开启但无 Pipeline

工具执行前直接发送（走 `onBlockReply` 回调），同时记录 key：

```typescript
// reply-delivery.ts:126-133
if (params.blockStreamingEnabled && params.blockReplyPipeline) {
  params.blockReplyPipeline.enqueue(blockPayload);  // 走 pipeline
} else if (params.blockStreamingEnabled) {
  // 直接发送（无 pipeline），记录 key 防止最终 payload 重复
  params.directlySentBlockKeys.add(createBlockReplyContentKey(blockPayload));
  await params.onBlockReply(blockPayload);
}
```

最终过滤时排除：

```typescript
// agent-runner-payloads.ts:214-218
params.directlySentBlockKeys?.size
  ? mediaFilteredPayloads.filter(
      (payload) => !params.directlySentBlockKeys!.has(createBlockReplyContentKey(payload)),
    )
  : mediaFilteredPayloads;
```

### 7.3 直接发送 vs Pipeline 发送

```
有 Pipeline 时：
  blockPayload → enqueue() → coalescer 缓冲 → flush() → onBlockReply()
  最终 payload → hasSentPayload() 检查 sentContentKeys

无 Pipeline 时：
  blockPayload → directlySentBlockKeys.add(key) → onBlockReply()
  最终 payload → directlySentBlockKeys 检查
```

### 7.4 内容 Key vs Payload Key

```typescript
// 内容 Key（用于最终去重）：不区分 replyToId
createBlockReplyContentKey = JSON.stringify({ text, mediaList })

// Payload Key（用于发送去重）：区分 replyToId
createBlockReplyPayloadKey = JSON.stringify({ text, mediaList, replyToId })
```

**为什么最终去重用 contentKey？** 因为流式发送的线程消息（replyToId = "post-1"）和最终合并的 payload（可能 replyToId = undefined）在内容相同时应该去重。

---

## 八、完整数据流

```
LLM SSE stream (Server-Sent Events)
    │
    ▼
session.subscribe(handler)  ← createEmbeddedPiSessionEventHandler(ctx)
    │
    ├──────────────────────────────────────────────┐
    │                                              │
    ▼                                              │
message_update ────────────────────────────────────▼──► ...
    │ text_delta/text_start/text_end
    │
    ▼
handleMessageUpdate(ctx, evt)
    │
    ├─► deltaBuffer += chunk  (单调追加策略)
    │      │
    │      ├─► blockChunker.append(chunk)  [分块模式]
    │      │      │
    │      │      ├─► drain({ force: false })
    │      │      │      │
    │      │      │      ▼
    │      │      │   pickBreakIndex() / pickSoftBreakIndex()
    │      │      │      │
    │      │      │      ▼
    │      │      │   emitBlockChunk(chunk)
    │      │      │      │
    │      │      │      ├─► stripBlockTags()
    │      │      │      ├─► isMessagingToolDuplicateNormalized()
    │      │      │      ├─► shouldSkipAssistantText()
    │      │      │      ├─► assistantTexts.push()
    │      │      │      └─► emitBlockReplySafely()
    │      │      │              │
    │      │      │              ├─► blockReplyPipeline.enqueue()
    │      │      │              │        │
    │      │      │              │        ├─► coalescer.enqueue()
    │      │      │              │        │        │
    │      │      │              │        │        └─► idleMs 计时器
    │      │      │              │        └─► sendPayload() → sendChain
    │      │      │              └─► directlySentBlockKeys.add() [无 pipeline]
    │      │      │                  (工具 flush 前走这条路)
    │      │
    │      └─► blockBuffer += chunk  [非分块模式]
    │
    ├─► reasoning stream
    │      └─► emitReasoningStream() → onReasoningStream()
    │
    └─► agent event → emitAgentEvent() (WS 广播)

    │
    ▼
tool_execution_start ─────────────────────────────────► handleToolExecutionStart()
    │ fire-and-forget async
    │
    ├─► flushBlockReplyBuffer()
    │      │
    │      ├─► blockChunker.drain({ force: true })
    │      └─► emitBlockChunk() → Pipeline.enqueue() / directlySent
    │
    ├─► toolMetaById.set(toolCallId, summary)
    │
    └─► emitAgentEvent({ phase: "start", toolName, args })

    │
    ▼
message_end ──────────────────────────────────────────► handleMessageEnd()
    │
    ├─► promoteThinkingTagsToBlocks()
    ├─► assistantTexts.push(finalText)
    ├─► finalizeAssistantTexts()
    │      └─► 非流式模型：确保最终文本进入 assistantTexts
    │
    ├─► emitBlockChunk() (如果 blockReplyBreak === "message_end")
    │
    ├─► reasoning emit
    │
    └─► 清空 deltaBuffer / blockBuffer / blockChunker
    │
    ▼
buildEmbeddedRunPayloads() ───────────────────────────────────┐
    │                                                     │
    ▼                                                     ▼
工具执行 ...                                       buildReplyPayloads()
    │                                                     │
    ├─► tool result events                                │
    │      └─► emitToolOutput()                           │
    │                                                     │
    └─► message_end (后续消息)                             ▼
                                                  最终 payload 过滤
    ┌─────────────────────────────────────────┐          │
    │  shouldDropFinalPayloads?                │          │
    │    = blockStreamingEnabled               │          │
    │      && didStream()                       │          │
    │      && !isAborted()                      │          │
    └─────────────────────────────────────────┘          │
          │ No
          ├─► hasSentPayload() → 过滤 pipeline 已发送  │
          ├─► directlySentBlockKeys → 过滤直发已发送    │
          ├─► isMessagingToolDuplicateNormalized()      │
          └─► suppressMessagingToolReplies()             │
                                                          ▼
                                                   最终 replyPayloads
                                                          │
                                                          ▼
                                                   发送给用户
```

---

## 九、handleToolExecutionStart 的副作用

```typescript
// pi-embedded-subscribe.handlers.tools.ts
export async function handleToolExecutionStart(ctx, evt) {
  // 1. Flush 待发文本（让用户先看到之前的 assistant 文字）
  ctx.flushBlockReplyBuffer();
  if (ctx.params.onBlockReplyFlush) {
    void ctx.params.onBlockReplyFlush();
  }

  // 2. 推断工具元数据
  const meta = extendExecMeta(toolName, args, inferToolMetaFromArgs(toolName, args));
  ctx.state.toolMetaById.set(toolCallId, buildToolCallSummary(toolName, args, meta));

  // 3. 发出 agent event（用于 WS 推送，让 UI 显示"正在执行工具"）
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "tool",
    data: { phase: "start", name: toolName, toolCallId, args: args as Record<string, unknown> },
  });
}
```

**三个关键作用**：

1. **flushBlockReplyBuffer**：确保工具执行前，用户已经看到模型生成的所有文本。这是"先看到文本，再看到工具执行"的用户体验基础。
2. **记录工具元数据**：`toolMetaById` 用于后续工具执行结果的关联。
3. **WS 广播**：`emitAgentEvent` 让 WebSocket 客户端实时感知工具执行状态。

---

## 十、消息工具去重（messagingToolSentTexts）

系统维护一个"通过消息工具（sendMessage/threadReply）已发送的文本"列表，用于避免重复：

```typescript
// 去重条件：同一目标 + 内容相同 → 跳过
if (isMessagingToolDuplicateNormalized(normalizedChunk, messagingToolSentTextsNormalized)) {
  return;  // 不再通过 block reply 发送
}
```

**为什么只在同一目标去重？** 跨目标发送（如在频道 A 发消息后，又在频道 B 发）不应该互相去重——它们是不同的对话上下文。

---

## 十一、blockReplyBreak 的两种模式

```typescript
blockReplyBreak: "text_end" | "message_end"
```

| 模式 | 含义 | 适用场景 |
|------|------|----------|
| `text_end` | 每个文本段结束时就 flush | 实时性要求高的场景 |
| `message_end` | 整条消息结束才 flush | 减少碎片化，希望模型完整回复后再推送 |

---

## 十二、开发避坑指南

### 12.1 不要在 tool_execution_start 中做阻塞操作

`tool_execution_start` 是 fire-and-forget，失败只记 debug 日志。如果在此做 RPC 调用等待，会延迟工具摘要显示。

### 12.2 deltaBuffer 和 blockBuffer 是两个不同的缓冲区

- `deltaBuffer`：追踪单条消息的累积文本（用于单调追加判断）
- `blockBuffer`：非分块模式下的推送缓冲

两者最终都会影响 `assistantTexts`，但用途不同。

### 12.3 最终 payload 的文本来自 assistantTexts，不是 blockBuffer

- `assistantTexts`：`message_end` 后确认的最终文本列表
- `blockBuffer`：流式过程中的中间态

在 `handleMessageEnd` 中通过 `finalizeAssistantTexts` 确保最终文本进入 `assistantTexts`。

### 12.4 hasSentPayload 用 contentKey 而非 payloadKey

`hasSentPayload` 使用 `createBlockReplyContentKey`（忽略 `replyToId`），确保内容相同的流式线程消息和最终 payload 能正确去重。

### 12.5 围栏内不能切分

`EmbeddedBlockChunker.drain()` 中使用 `isSafeFenceBreak()` 判断是否在代码块内切分。如果硬切点在围栏内，会生成 `fenceSplit` 对象关闭并重新打开围栏。

### 12.6 Pipeline 超时会中止后续所有发送

```typescript
if (err === timeoutError) {
  abortController.abort();
  aborted = true;  // 后续所有 enqueue 都被忽略
  logVerbose(`block reply delivery timed out after ${timeoutMs}ms; skipping remaining block replies`);
}
```

---

## 十三、自检清单

- [ ] `tool_execution_start` handler 是 async fire-and-forget，失败只记 debug，不影响工具执行
- [ ] 文本流使用单调追加策略，防止 `text_end` 重发完整内容导致重复
- [ ] `EmbeddedBlockChunker.#buffer` 是私有字段，只通过 `bufferedText` getter 读取
- [ ] `directlySentBlockKeys` 只在"blockStreaming 开启但无 pipeline"时使用
- [ ] 最终 payload 过滤发生在 `buildReplyPayloads` 中，而不是 subscribe 层
- [ ] `BlockReplyPipeline.hasSentPayload` 通过 `contentKey`（而非 `payloadKey`）去重
- [ ] `flushBlockReplyBuffer` 在工具执行前调用，确保文本先于工具可见
- [ ] `emitBlockChunk` 会检查 `messagingToolSentTextsNormalized`，避免消息工具重复
- [ ]围栏切分使用 `fenceSplit` 关闭+重新打开围栏，保持 Markdown 有效
- [ ] `blockReplyBreak === "text_end"` 时每个 text_end 事件都触发 flush
- [ ] `blockReplyBreak === "message_end"` 时只在 message_end 才 flush
- [ ] `coalescer` 的 `idleMs` 用于空闲时自动 flush，减少碎片
- [ ] `sendChain` 串行化确保 block 按序到达，不会乱序

---

## 十四、进阶主题：compact（压缩重试）

当模型输出过长时，系统会触发 compact（压缩摘要），丢弃之前的思考过程，只保留最终答案。相关状态：

```typescript
compactionInFlight: boolean,           // 压缩是否在进行中
pendingCompactionRetry: number,        // 待处理的压缩重试次数
compactionRetryPromise: Promise<void> | null,  // 等待压缩完成的 Promise
```

**重试流程**：

1. 压缩触发 → `noteCompactionRetry()` → `pendingCompactionRetry++`
2. `ensureCompactionPromise()` 创建 Promise 等待所有压缩完成
3. 压缩完成 → `resolveCompactionRetry()` → `pendingCompactionRetry--`
4. 计数归零 → resolve compaction promise

**unsubscribe 时**：拒绝 compaction promise（`reject(AbortError)`），防止悬空的 Promise 阻塞清理流程。
