# 命令执行与消息发送链路详解

> 本文档通过 OpenClaw 项目源码，详细解析 `openclaw message ...` 从 CLI 参数到实际向通道发送消息的完整链路。通过学习这个设计，你可以掌握构建复杂 agent 系统的消息发送架构经验。

---

## 目录

1. [整体执行链路概览](#1-整体执行链路概览)
2. [链路详解](#2-链路详解)
   - [Step 1: 命令注册](#step-1-命令注册)
   - [Step 2: CLI Helper 封装](#step-2-cli-helper-封装)
   - [Step 3: 命令入口协调](#step-3-命令入口协调)
   - [Step 4: Action 调度器](#step-4-action-调度器)
   - [Step 5: 发送执行引擎](#step-5-发送执行引擎)
   - [Step 6: 通道适配器](#step-6-通道适配器)
3. [发送队列与故障恢复](#3-发送队列与故障恢复)
4. [通道选择与目标解析](#4-通道选择与目标解析)
5. [设计亮点总结](#5-设计亮点总结)

---

## 1. 整体执行链路概览

```
openclaw message send --channel discord --target channel:123 --message "Hi"
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 1: register.message.ts                                         │
│  命令注册：send, poll, react, read, edit, delete, broadcast 等     │
│  每个子命令都走统一 helper                                            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 2: message/helpers.ts                                         │
│  createMessageCliHelpers()                                           │
│  提供通用选项：--channel, --account, --json, --dry-run              │
│  统一调用 messageCommand()                                           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 3: commands/message.ts                                        │
│  入口协调层                                                         │
│  - 解析 action（send/poll/react...）                                 │
│  - 构造 outbound 依赖                                                │
│  - 调用 runMessageAction()                                          │
│  - 处理 JSON/文本输出                                               │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 4: message-action-runner.ts                                   │
│  核心编排层                                                         │
│  - 通道选择（自动或显式）                                            │
│  - 目标解析（用户、群组、channel id）                                │
│  - Thread ID 自动推断                                               │
│  - 跨上下文装饰                                                     │
│  - 分发到 send/poll/broadcast/...                                  │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 5: deliver.ts / outbound-send-service.ts                    │
│  发送执行引擎                                                       │
│  - 通道 outbound adapter（插件化）                                   │
│  - 文本分块（不同平台有不同长度限制）                                │
│  - Best-effort 处理                                                 │
│  - 写入发送队列，成功后 ack，失败标记 fail                          │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 6: channels/plugins/*                                        │
│  通道适配器（插件合同）                                             │
│  - sendText / sendMedia / sendPayload                               │
│  - 每个通道自行实现（Discord/Telegram/Signal/iMessage）             │
│  - 核心层不需要知道通道内部细节                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 链路详解

### Step 1: 命令注册

**源码位置**：`src/cli/program/register.message.ts`

**职责**：把 `message` 大命令拆分成多个子命令

```typescript
export function registerMessageCommands(program: Command, ctx: ProgramContext) {
  const message = program
    .command("message")
    .description("Send, read, and manage messages and channel actions");

  // 创建通用的 CLI helpers
  const helpers = createMessageCliHelpers(message, ctx.messageChannelOptions);

  // 注册所有子命令
  registerMessageSendCommand(message, helpers);        // send
  registerMessageBroadcastCommand(message, helpers);   // broadcast
  registerMessagePollCommand(message, helpers);          // poll
  registerMessageReactionsCommands(message, helpers);   // react
  registerMessageReadEditDeleteCommands(message, helpers); // read/edit/delete
  registerMessagePinCommands(message, helpers);        // pin
  registerMessagePermissionsCommand(message, helpers);  // permissions
  registerMessageSearchCommand(message, helpers);       // search
  registerMessageThreadCommands(message, helpers);      // thread
  registerMessageEmojiCommands(message, helpers);      // emoji
  registerMessageStickerCommands(message, helpers);     // sticker
  registerMessageDiscordAdminCommands(message, helpers); // discord admin
}
```

**处理细节**：

1. **统一 Helper**：所有子命令共享相同的选项模式
   ```typescript
   // helpers 提供的基础选项
   --channel <channel>    // 通道类型
   --account <id>         // 账号 ID
   --json                 // JSON 输出
   --dry-run              // 干跑模式
   --verbose              // 详细日志
   -t, --target <dest>   // 目标地址
   ```

2. **命令风格一致**：每个子命令都使用统一的参数解析方式

3. **Help 文本**：自动生成使用示例

---

### Step 2: CLI Helper 封装

**源码位置**：`src/cli/program/message/helpers.ts`

```typescript
export function createMessageCliHelpers(
  message: Command,
  messageChannelOptions: string,
): MessageCliHelpers {
  // 1. 基础选项装饰器
  const withMessageBase = (command: Command) =>
    command
      .option("--channel <channel>", `Channel: ${messageChannelOptions}`)
      .option("--account <id>", "Channel account id (accountId)")
      .option("--json", "Output result as JSON", false)
      .option("--dry-run", "Print payload and skip sending", false)
      .option("--verbose", "Verbose logging", false);

  // 2. 目标选项装饰器
  const withMessageTarget = (command: Command) =>
    command.option("-t, --target <dest>", CHANNEL_TARGET_DESCRIPTION);

  // 3. 统一动作执行器
  const runMessageAction = async (action: string, opts: Record<string, unknown>) => {
    setVerbose(Boolean(opts.verbose));
    ensurePluginRegistryLoaded();

    const deps = createDefaultDeps();
    await runCommandWithRuntime(
      defaultRuntime,
      async () => {
        await messageCommand(
          { ...normalizeMessageOptions(opts), action },
          deps,
          defaultRuntime,
        );
      },
      (err) => { /* 错误处理 */ },
    );
    await runPluginStopHooks();  // 运行停止钩子
    defaultRuntime.exit(failed ? 1 : 0);
  };

  return { withMessageBase, withMessageTarget, withRequiredMessageTarget, runMessageAction };
}
```

**处理细节**：

1. **选项规范化**：`normalizeMessageOptions` 把 `account` 转成 `accountId`
2. **插件注册表加载**：确保插件在执行前已加载
3. **生命周期钩子**：执行前后运行 `gateway_stop` 钩子
4. **干跑模式**：`--dry-run` 只打印 payload，不实际发送

---

### Step 3: 命令入口协调

**源码位置**：`src/commands/message.ts`

```typescript
export async function messageCommand(
  opts: Record<string, unknown>,
  deps: CliDeps,
  runtime: RuntimeEnv,
) {
  // 1. 加载配置并解析 Secret 引用
  const { resolvedConfig: cfg, diagnostics } = await resolveCommandSecretRefsViaGateway({
    config: loadConfig(),
    commandName: "message",
    targetIds: getChannelsCommandSecretTargetIds(),
  });
  for (const entry of diagnostics) {
    runtime.log(`[secrets] ${entry}`);
  }

  // 2. 解析 action（默认 send）
  const rawAction = typeof opts.action === "string" ? opts.action.trim() : "";
  const actionInput = rawAction || "send";
  const actionMatch = CHANNEL_MESSAGE_ACTION_NAMES.find(
    (name) => name.toLowerCase() === actionInput.toLowerCase(),
  );
  if (!actionMatch) {
    throw new Error(`Unknown message action: ${actionInput}`);
  }
  const action = actionMatch as ChannelMessageActionName;

  // 3. 构造 outbound 依赖
  const outboundDeps: OutboundSendDeps = createOutboundSendDeps(deps);

  // 4. 执行 action
  const run = async () =>
    await runMessageAction({
      cfg,
      action,
      params: opts,
      deps: outboundDeps,
      gateway: {
        clientName: GATEWAY_CLIENT_NAMES.CLI,
        mode: GATEWAY_CLIENT_MODES.CLI,
      },
    });

  // 5. 根据选项决定是否显示进度条
  const needsSpinner = !json && !dryRun && (action === "send" || action === "poll");
  const result = needsSpinner
    ? await withProgress({ label: "Sending...", indeterminate: true }, run)
    : await run();

  // 6. 输出结果
  if (json) {
    runtime.log(JSON.stringify(buildMessageCliJson(result), null, 2));
  } else {
    for (const line of formatMessageCliText(result)) {
      runtime.log(line);
    }
  }
}
```

**处理细节**：

1. **Secret 引用解析**：通过 Gateway 解析命令中引用的 secrets
2. **Action 标准化**：用户输入 `SEND` / `Send` / `send` 都映射到 `send`
3. **进度条**：send 和 poll 动作显示进度条
4. **输出格式**：支持 JSON 和文本两种输出格式

---

### Step 4: Action 调度器

**源码位置**：`src/infra/outbound/message-action-runner.ts`

这是**最核心**的编排层，负责把 CLI 参数转换成实际的发送操作：

```typescript
export async function runMessageAction(input: RunMessageActionParams): Promise<MessageActionRunResult> {
  const cfg = input.cfg;
  let params = { ...input.params };

  // ── 1. 参数预处理 ──────────────────────────────
  parseButtonsParam(params);      // 解析按钮参数
  parseCardParam(params);         // 解析卡片参数
  parseComponentsParam(params);    // 解析组件参数
  parseInteractiveParam(params);  // 解析交互参数

  // ── 2. 通道选择 ────────────────────────────────
  const channel = await resolveChannel(cfg, params, input.toolContext);
  // 支持：
  // - 显式指定：--channel discord
  // - 工具上下文回退：toolContext.currentChannelProvider
  // - 单通道自动选择：只有一个配置通道时
  // - 报错：多个通道配置时必须显式指定

  // ── 3. 账号解析 ────────────────────────────────
  let accountId = readStringParam(params, "accountId") ?? input.defaultAccountId;
  if (!accountId && resolvedAgentId) {
    const byAgent = buildChannelAccountBindings(cfg).get(channel);
    const boundAccountIds = byAgent?.get(normalizeAgentId(resolvedAgentId));
    if (boundAccountIds?.length > 0) {
      accountId = boundAccountIds[0];  // 根据 agent 绑定选择账号
    }
  }

  // ── 4. 媒体参数规范化 ─────────────────────────
  await normalizeSandboxMediaParams({ args: params, mediaPolicy });
  await hydrateAttachmentParamsForAction({ cfg, channel, args: params, action, dryRun, mediaPolicy });

  // ── 5. 目标解析 ───────────────────────────────
  const resolvedTarget = await resolveActionTarget({
    cfg, channel, action, args: params, accountId,
  });

  // ── 6. 跨上下文标记 ───────────────────────────
  enforceCrossContextPolicy({ channel, action, args: params, toolContext: input.toolContext, cfg });

  // ── 7. 分发到具体处理器 ───────────────────────
  if (action === "send") {
    return handleSendAction({ cfg, params, channel, accountId, dryRun, gateway, input, agentId, resolvedTarget, abortSignal });
  }
  if (action === "poll") {
    return handlePollAction({ cfg, params, channel, accountId, dryRun, gateway, input, abortSignal });
  }
  return handlePluginAction({ cfg, params, channel, accountId, dryRun, gateway, input, abortSignal });
}
```

**关键处理函数解析**：

#### 4.1 通道选择 `resolveChannel`

```typescript
async function resolveChannel(cfg, params, toolContext) {
  const selection = await resolveMessageChannelSelection({
    cfg,
    channel: readStringParam(params, "channel"),        // 显式指定
    fallbackChannel: toolContext?.currentChannelProvider, // 上下文回退
  });
  // selection.source: "explicit" | "tool-context-fallback" | "single-configured"
  return selection.channel;
}
```

**选择优先级**：
1. **显式指定**：`--channel discord`
2. **工具上下文回退**：从当前工具上下文获取
3. **单通道自动选择**：只有一个配置通道时
4. **报错**：多个通道配置时未指定

#### 4.2 目标解析 `resolveActionTarget`

```typescript
async function resolveActionTarget({ cfg, channel, action, args }) {
  // 解析 --target 参数
  const toRaw = typeof args.to === "string" ? args.to.trim() : "";
  if (toRaw) {
    const resolved = await resolveChannelTarget({
      cfg,
      channel,
      input: toRaw,
      accountId,
    });
    if (resolved.ok) {
      args.to = resolved.target.to;  // 覆盖为规范化后的目标
      resolvedTarget = resolved.target;
    } else {
      throw resolved.error;
    }
  }

  // 解析 --channelId 参数
  const channelIdRaw = args.channelId?.trim();
  if (channelIdRaw) {
    const resolved = await resolveChannelTarget({
      cfg, channel, input: channelIdRaw, accountId, preferredKind: "group"
    });
    // ... 类似处理
  }
  return resolvedTarget;
}
```

**目标类型**：
- `user`：用户直接消息
- `group`：群组/频道消息

#### 4.3 Thread ID 自动推断

```typescript
function resolveAndApplyOutboundThreadId(params, ctx) {
  const threadId = readStringParam(params, "threadId");
  const resolved = threadId
    ?? getChannelPlugin(ctx.channel)?.threading?.resolveAutoThreadId?.({
      cfg: ctx.cfg,
      accountId: ctx.accountId,
      to: ctx.to,
      toolContext: ctx.toolContext,
      replyToId: readStringParam(params, "replyTo"),
    });
  // 写回 params 以便下游处理
  if (resolved && !params.threadId) {
    params.threadId = resolved;
  }
  return resolved ?? undefined;
}
```

#### 4.4 Send 处理 `handleSendAction`

```typescript
async function handleSendAction(ctx) {
  const { cfg, params, channel, accountId, dryRun, gateway, input, agentId } = ctx;

  // 1. 读取消息内容
  let message = readStringParam(params, "message", { required: true }) ?? "";

  // 2. 处理转义
  if (message.includes("\\n")) {
    message = message.replaceAll("\\n", "\n");  // 还原转义换行
  }

  // 3. 合并媒体 URL
  const mediaHint = readStringParam(params, "media");
  const mergedMediaUrls = [...];
  // 从 reply 指令中提取媒体 URL

  // 4. 解析 Reply 指令
  const parsed = parseReplyDirectives(message);  // 解析 [[media:...]] 等指令

  // 5. 应用跨上下文标记
  message = await maybeApplyCrossContextMarker({ cfg, channel, action, target: to, ... });

  // 6. 创建会话路由（用于追踪）
  const outboundRoute = await resolveOutboundSessionRoute({ cfg, channel, agentId, ... });

  // 7. 执行发送
  const send = await executeSendAction({
    ctx: { cfg, channel, params, agentId, accountId, gateway, toolContext, deps, dryRun, mirror, abortSignal, silent },
    to, message, mediaUrl, mediaUrls, gifPlayback, forceDocument, bestEffort, replyToId, threadId,
  });

  return {
    kind: "send",
    channel, action: "send", to,
    handledBy: send.handledBy,  // "plugin" | "core"
    payload: send.payload,
    sendResult: send.sendResult,
    dryRun,
  };
}
```

---

### Step 5: 发送执行引擎

**源码位置**：`src/infra/outbound/outbound-send-service.ts` 和 `deliver.ts`

#### 5.1 双路径分发

```typescript
export async function executeSendAction(params): Promise<{
  handledBy: "plugin" | "core";
  payload: unknown;
  sendResult?: MessageSendResult;
}> {
  // 路径 1：尝试插件处理
  const pluginHandled = await tryHandleWithPluginAction({
    ctx: params.ctx,
    action: "send",
    onHandled: async () => {
      // 成功后更新会话镜像
      if (params.ctx.mirror) {
        await appendAssistantMessageToSessionTranscript({ ... });
      }
    },
  });
  if (pluginHandled) {
    return pluginHandled;  // 插件已处理，直接返回
  }

  // 路径 2：核心发送（走 deliverOutboundPayloads）
  const result = await sendMessage({
    cfg: params.ctx.cfg,
    to: params.to,
    content: params.message,
    // ... 传递所有参数
  });

  return { handledBy: "core", payload: result, sendResult: result };
}
```

#### 5.2 核心发送 `sendMessage`

```typescript
export async function sendMessage(params: MessageSendParams): Promise<MessageSendResult> {
  const cfg = params.cfg ?? loadConfig();
  const channel = await resolveRequiredChannel({ cfg, channel: params.channel });
  const plugin = resolveRequiredPlugin(channel, cfg);
  const deliveryMode = plugin.outbound?.deliveryMode ?? "direct";

  // dry-run 模式直接返回
  if (params.dryRun) {
    return { channel, to: params.to, via: deliveryMode, dryRun: true };
  }

  // 直接发送模式
  if (deliveryMode !== "gateway") {
    const resolvedTarget = resolveOutboundTarget({ channel, to: params.to, cfg, accountId, mode: "explicit" });
    const results = await deliverOutboundPayloads({
      cfg, channel, to: resolvedTarget.to,
      payloads: normalizedPayloads,
      replyToId: params.replyToId,
      threadId: params.threadId,
      deps: params.deps,
      bestEffort: params.bestEffort,
      abortSignal: params.abortSignal,
      silent: params.silent,
      mirror: params.mirror,
    });
    return { channel, to: params.to, via: "direct", result: results.at(-1) };
  }

  // Gateway 代理模式
  const result = await callMessageGateway({ gateway: params.gateway, method: "send", params: { ... } });
  return { channel, to: params.to, via: "gateway", result };
}
```

#### 5.3 核心投递逻辑 `deliverOutboundPayloads`

```typescript
export async function deliverOutboundPayloads(params): Promise<OutboundDeliveryResult[]> {
  const { channel, to, payloads } = params;

  // ── 1. 写入发送队列（WAL 模式）────────────────
  const queueId = await enqueueDelivery({
    channel, to, accountId, payloads, threadId, replyToId,
    bestEffort, gifPlayback, forceDocument, silent, mirror,
  }).catch(() => null);  // 队列写入失败不影响发送

  try {
    // ── 2. 执行核心发送 ───────────────────────────
    const results = await deliverOutboundPayloadsCore(params);

    // ── 3. 成功后 ACK ────────────────────────────
    if (queueId) {
      if (hadPartialFailure) {
        await failDelivery(queueId, "partial delivery failure (bestEffort)");
      } else {
        await ackDelivery(queueId);  // 两阶段确认：先标记完成，再删除
      }
    }
    return results;
  } catch (err) {
    if (queueId) {
      if (isAbortError(err)) {
        await ackDelivery(queueId);  // 中止不算失败
      } else {
        await failDelivery(queueId, err.message);
      }
    }
    throw err;
  }
}
```

#### 5.4 核心发送循环 `deliverOutboundPayloadsCore`

```typescript
async function deliverOutboundPayloadsCore(params): Promise<OutboundDeliveryResult[]> {
  const { cfg, channel, to, payloads } = params;

  // 1. 创建通道处理器
  const handler = await createChannelHandler({ cfg, channel, to, ... });

  // 2. 确定文本分块限制
  const textLimit = handler.resolveEffectiveTextChunkLimit?.(configuredLimit) ?? configuredLimit;
  const chunkMode = handler.chunker ? resolveChunkMode(cfg, channel, accountId) : "length";

  // 3. 创建分块发送函数
  const sendTextChunks = async (text, overrides) => {
    if (!handler.chunker || textLimit === undefined) {
      results.push(await handler.sendText(text, overrides));
      return;
    }
    // 根据模式分块：newline 或 length
    const chunks = handler.chunker(text, textLimit);
    for (const chunk of chunks) {
      throwIfAborted(abortSignal);
      results.push(await handler.sendText(chunk, overrides));
    }
  };

  // 4. 遍历 payloads 发送
  for (const payload of normalizedPayloads) {
    // 4.1 运行 message_sending 钩子（可修改内容或取消）
    const hookResult = await applyMessageSendingHook({ hookRunner, enabled, payload, ... });
    if (hookResult.cancelled) continue;

    // 4.2 发送交互内容
    if (handler.sendPayload && hasReplyContent({ interactive: payload.interactive })) {
      const delivery = await handler.sendPayload(payload, sendOverrides);
      results.push(delivery);
      emitMessageSent({ success: true, ... });
      continue;
    }

    // 4.3 纯文本发送
    if (payloadSummary.mediaUrls.length === 0) {
      if (handler.sendFormattedText) {
        results.push(...(await handler.sendFormattedText(text, sendOverrides)));
      } else {
        await sendTextChunks(text, sendOverrides);
      }
      emitMessageSent({ success: true, ... });
      continue;
    }

    // 4.4 媒体发送
    if (!handler.supportsMedia) {
      // 降级到文本
      await sendTextChunks(fallbackText, sendOverrides);
      continue;
    }
    for (const url of payloadSummary.mediaUrls) {
      if (handler.sendFormattedMedia) {
        results.push(await handler.sendFormattedMedia(caption, url, sendOverrides));
      } else {
        results.push(await handler.sendMedia(caption, url, sendOverrides));
      }
    }
  }

  // 5. 更新会话镜像
  if (params.mirror && results.length > 0) {
    await appendAssistantMessageToSessionTranscript({
      agentId, sessionKey: params.mirror.sessionKey, text: mirrorText, idempotencyKey
    });
  }

  return results;
}
```

---

### Step 6: 通道适配器

#### 6.1 适配器加载

**源码位置**：`src/channels/plugins/outbound/load.ts`

```typescript
// 轻量级加载器，只加载 outbound 能力
const loadOutboundAdapterFromRegistry = createChannelRegistryLoader<ChannelOutboundAdapter>(
  (entry) => entry.plugin.outbound,
);

export async function loadChannelOutboundAdapter(id: ChannelId): Promise<ChannelOutboundAdapter | undefined> {
  return loadOutboundAdapterFromRegistry(id);
}
```

#### 6.2 适配器合同

**源码位置**：`src/channels/plugins/types.ts`

```typescript
type ChannelOutboundAdapter = {
  deliveryMode: "direct" | "gateway";

  // 文本分块
  chunker?: (text: string, limit: number) => string[];
  chunkerMode?: "text" | "markdown";
  textChunkLimit?: number;

  // 发送方法
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendMedia?: (ctx: ChannelOutboundContext & { text: string; mediaUrl: string }) => Promise<OutboundDeliveryResult>;
  sendPayload?: (ctx: ChannelOutboundContext & { text: string; payload: ReplyPayload }) => Promise<OutboundDeliveryResult>;
  sendFormattedText?: (ctx: ChannelOutboundContext & { text: string }) => Promise<OutboundDeliveryResult[]>;
  sendFormattedMedia?: (ctx: ChannelOutboundContext & { text: string; mediaUrl: string }) => Promise<OutboundDeliveryResult>;

  // 媒体支持
  supportsMedia?: boolean;
  resolveEffectiveTextChunkLimit?: (params: { cfg, accountId, fallbackLimit }) => number | undefined;
  normalizePayload?: (params: { payload: ReplyPayload }) => ReplyPayload | null;
  shouldSkipPlainTextSanitization?: (params: { payload: ReplyPayload }) => boolean;
};
```

#### 6.3 通道处理器创建

**源码位置**：`src/infra/outbound/message-action-runner.ts`

```typescript
async function createChannelHandler(params: ChannelHandlerParams): Promise<ChannelHandler> {
  // 1. 确保通道插件已加载
  resolveOutboundChannelPlugin({ channel: params.channel, cfg: params.cfg });

  // 2. 加载 outbound 适配器
  const outbound = await loadChannelOutboundAdapter(params.channel);

  // 3. 创建插件处理器包装
  const handler = createPluginHandler({ ...params, outbound });
  if (!handler) {
    throw new Error(`Outbound not configured for channel: ${params.channel}`);
  }
  return handler;
}

function createPluginHandler(params): ChannelHandler | null {
  const outbound = params.outbound;
  if (!outbound?.sendText) {
    return null;  // 通道不支持发送
  }

  // 创建基础上下文
  const baseCtx = createChannelOutboundContextBase(params);

  // 包装所有发送方法，注入上下文
  return {
    chunker: outbound.chunker,
    chunkerMode: outbound.chunkerMode,
    textChunkLimit: outbound.textChunkLimit,
    supportsMedia: Boolean(outbound.sendMedia),

    sendText: async (text, overrides) =>
      outbound.sendText({ ...baseCtx, text, ...overrides }),

    sendMedia: async (caption, mediaUrl, overrides) =>
      outbound.sendMedia({ ...baseCtx, text: caption, mediaUrl, ...overrides }),

    sendPayload: async (payload, overrides) =>
      outbound.sendPayload({ ...baseCtx, text: payload.text ?? "", mediaUrl: payload.mediaUrl, payload, ...overrides }),
  };
}
```

#### 6.4 直接文本媒体适配器

**源码位置**：`src/channels/plugins/outbound/direct-text-media.ts`

```typescript
export function createDirectTextMediaOutbound<T, TResult>(params: {
  channel: "imessage" | "signal";
  resolveSender: (deps) => DirectSendFn<TOpts, TResult>;
  resolveMaxBytes: ({ cfg, accountId }) => number | undefined;
  buildTextOptions: (opts: DirectSendOptions) => TOpts;
  buildMediaOptions: (opts: DirectSendOptions) => TOpts;
}): ChannelOutboundAdapter {
  const outbound: ChannelOutboundAdapter = {
    deliveryMode: "direct",
    chunker: chunkText,          // 使用 chunkText 进行分块
    chunkerMode: "text",
    textChunkLimit: 4000,

    sendPayload: async (ctx) =>
      await sendTextMediaPayload({ channel: params.channel, ctx, adapter: outbound }),

    sendText: async ({ cfg, to, text, accountId, deps, replyToId }) =>
      await sendDirect({
        cfg, to, text, accountId, deps, replyToId,
        buildOptions: params.buildTextOptions,
      }),

    sendMedia: async ({ cfg, to, text, mediaUrl, accountId, deps, replyToId }) =>
      await sendDirect({
        cfg, to, text, mediaUrl, accountId, deps, replyToId,
        buildOptions: params.buildMediaOptions,
      }),
  };
  return outbound;
}
```

---

## 3. 发送队列与故障恢复

**源码位置**：`src/infra/outbound/delivery-queue.ts`

### 3.1 写入-ahead 日志（WAL）模式

```typescript
export async function enqueueDelivery(params: QueuedDeliveryParams, stateDir?: string): Promise<string> {
  const queueDir = await ensureQueueDir(stateDir);
  const id = generateSecureUuid();
  const entry: QueuedDelivery = {
    id, enqueuedAt: Date.now(), channel: params.channel, to: params.to,
    payloads: params.payloads, threadId, replyToId, bestEffort, gifPlayback,
    forceDocument, silent, mirror, retryCount: 0,
  };

  // 原子性写入：先写临时文件，再 rename
  const filePath = path.join(queueDir, `${id}.json`);
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, json, { encoding: "utf-8", mode: 0o600 });
  await fs.promises.rename(tmp, filePath);  // 原子操作
  return id;
}
```

### 3.2 两阶段确认

```typescript
// Phase 1: 把 .json 重命名为 .delivered（原子操作）
// Phase 2: 删除 .delivered 标记
export async function ackDelivery(id: string, stateDir?: string): Promise<void> {
  const { jsonPath, deliveredPath } = resolveQueueEntryPaths(id, stateDir);
  await fs.promises.rename(jsonPath, deliveredPath);  // Phase 1
  await unlinkBestEffort(deliveredPath);               // Phase 2
}
```

**防止崩溃问题**：
- 如果在 Phase 1 和 Phase 2 之间崩溃，重启时会看到 `.delivered` 文件，清理掉即可
- 不会导致消息被重复发送

### 3.3 失败处理与重试

```typescript
export async function failDelivery(id: string, error: string, stateDir?: string): Promise<void> {
  const filePath = path.join(resolveQueueDir(stateDir), `${id}.json`);
  const raw = await fs.promises.readFile(filePath, "utf-8");
  const entry: QueuedDelivery = JSON.parse(raw);
  entry.retryCount += 1;
  entry.lastAttemptAt = Date.now();
  entry.lastError = error;
  // 写回
  await fs.promises.writeFile(tmp, JSON.stringify(entry), { mode: 0o600 });
  await fs.promises.rename(tmp, filePath);
}
```

### 3.4 启动时恢复

```typescript
export async function recoverPendingDeliveries(opts): Promise<RecoverySummary> {
  const pending = await loadPendingDeliveries(opts.stateDir);

  for (const entry of pending) {
    // 检查是否超过最大重试次数
    if (entry.retryCount >= MAX_RETRIES) {
      await moveToFailed(entry.id);  // 移入 failed/ 目录
      continue;
    }

    // 检查退避时间
    const backoff = computeBackoffMs(entry.retryCount + 1);
    if (now < entry.lastAttemptAt + backoff) {
      continue;  // 还在冷却期
    }

    // 执行发送
    try {
      await opts.deliver({ ...entry, skipQueue: true });
      await ackDelivery(entry.id);  // 成功后确认
    } catch (err) {
      if (isPermanentDeliveryError(err.message)) {
        await moveToFailed(entry.id);  // 永久性错误，直接标记失败
      } else {
        await failDelivery(entry.id, err.message);  // 临时错误，重试
      }
    }
  }
}
```

**退避策略**：
```typescript
const BACKOFF_MS = [
  5_000,    // retry 1: 5s
  25_000,   // retry 2: 25s
  120_000,   // retry 3: 2m
  600_000,   // retry 4: 10m
];
const MAX_RETRIES = 5;
```

**永久性错误**（不重试）：
- `no conversation reference found`
- `chat not found`
- `bot was blocked by the user`
- `bot was kicked from chat`
- `ambiguous discord recipient`

---

## 4. 通道选择与目标解析

### 4.1 通道选择策略

**源码位置**：`src/infra/outbound/channel-selection.ts`

```typescript
export async function resolveMessageChannelSelection(params): Promise<{
  channel: MessageChannelId;
  configured: MessageChannelId[];
  source: MessageChannelSelectionSource;
}> {
  // 1. 显式指定
  if (params.channel) {
    const availableExplicit = resolveAvailableKnownChannel({ cfg, value: params.channel });
    if (availableExplicit) {
      return { channel: availableExplicit, configured, source: "explicit" };
    }
    // 指定的通道不可用，尝试 fallback
    const fallback = resolveAvailableKnownChannel({ cfg, value: params.fallbackChannel });
    if (fallback) {
      return { channel: fallback, configured, source: "tool-context-fallback" };
    }
    // 未知通道
    throw new Error(`Unknown channel: ${params.channel}`);
  }

  // 2. 从工具上下文获取 fallback
  if (params.fallbackChannel) {
    const fallback = resolveAvailableKnownChannel({ cfg, value: params.fallbackChannel });
    if (fallback) {
      return { channel: fallback, configured, source: "tool-context-fallback" };
    }
  }

  // 3. 单通道自动选择
  const configured = await listConfiguredMessageChannels(cfg);
  if (configured.length === 1) {
    return { channel: configured[0], configured, source: "single-configured" };
  }

  // 4. 多个通道，必须显式指定
  if (configured.length === 0) {
    throw new Error("Channel is required (no configured channels detected).");
  }
  throw new Error(`Channel is required when multiple channels are configured: ${configured.join(", ")}`);
}
```

### 4.2 目标解析

**源码位置**：`src/infra/outbound/target-resolver.ts`

```typescript
export async function resolveMessagingTarget(params): Promise<ResolveMessagingTargetResult> {
  const { cfg, channel, input, accountId, preferredKind } = params;
  const kind = detectTargetKind(channel, raw, preferredKind);

  // 1. ID 类目标（直接发送）
  if (looksLikeTargetId()) {
    const resolved = await maybeResolveIdLikeTarget({ cfg, channel, input, accountId });
    if (resolved) return { ok: true, target: resolved };
    // ID 格式正确但未找到目录项，直接使用
    return buildNormalizedResolveResult({ channel, raw, normalized, kind });
  }

  // 2. 名称类目标（查询目录）
  const entries = await getDirectoryEntries({ cfg, channel, accountId, kind, query: stripTargetPrefixes(raw) });
  const match = resolveMatch({ channel, entries, query });

  if (match.kind === "single") {
    return { ok: true, target: { to: entry.to, kind, display: entry.name, source: "directory" } };
  }

  if (match.kind === "ambiguous") {
    // 多个匹配，抛出错误或选择最佳
    return { ok: false, error: ambiguousTargetError(...), candidates: match.entries };
  }

  // 3. 未知目标
  return { ok: false, error: unknownTargetError(...) };
}
```

**ID 类目标特征**：
```typescript
function looksLikeTargetId(): boolean {
  const trimmed = raw.trim();
  // 明确的格式
  if (/^(channel|group|user):/i.test(trimmed)) return true;
  if (/^[@#]/.test(trimmed)) return true;  // @user, #channel
  if (/^\+?\d{6,}$/.test(trimmed)) return true;  // 电话号码
  if (trimmed.includes("@thread")) return true;
  return false;
}
```

---

## 5. 设计亮点总结

### 5.1 分层架构

```
┌─────────────────────────────────────────┐
│         CLI 入口层                       │
│  register.message.ts                   │
│  message/helpers.ts                    │
├─────────────────────────────────────────┤
│         命令协调层                       │
│  commands/message.ts                   │
├─────────────────────────────────────────┤
│         Action 调度层                   │
│  message-action-runner.ts              │
│  - 通道选择                            │
│  - 目标解析                            │
│  - 参数规范化                          │
│  - 分发到具体 action                   │
├─────────────────────────────────────────┤
│         发送执行层                      │
│  outbound-send-service.ts              │
│  deliver.ts                           │
│  - 插件/核心双路径                     │
│  - 文本分块                           │
│  - 发送队列                           │
├─────────────────────────────────────────┤
│         通道适配层                      │
│  channel-adapters.ts                  │
│  direct-text-media.ts                 │
│  每个通道独立实现                      │
└─────────────────────────────────────────┘
```

### 5.2 关键设计模式

| 模式 | 位置 | 说明 |
|------|------|------|
| **双路径分发** | `outbound-send-service.ts` | 优先插件处理，降级到核心发送 |
| **写入-ahead 日志** | `delivery-queue.ts` | 发送前持久化，成功后清理 |
| **两阶段确认** | `ackDelivery` | 防止崩溃导致的重复发送 |
| **指数退避** | `delivery-queue.ts` | 临时错误重试，永久错误不重试 |
| **适配器模式** | `createPluginHandler` | 统一接口，多通道实现 |
| **上下文传递** | `ChannelOutboundContext` | 所有通道共享上下文 |
| **自动发现** | `resolveChannel` | 支持显式/回退/自动多种模式 |

### 5.3 错误处理策略

1. **永久性错误**（不重试）：
   - 目标不存在
   - 用户阻止了机器人
   - 机器人被踢出群组

2. **临时性错误**（重试）：
   - 网络超时
   - 服务暂时不可用
   - 限流

3. **Best-Effort 模式**：
   - 部分消息发送失败不整体失败
   - 继续发送其他消息

### 5.4 文本分块策略

```typescript
// 不同分块模式
const chunkMode = handler.chunker
  ? resolveChunkMode(cfg, channel, accountId)
  : "length";

// text 模式：按段落分块
const blockChunks = chunkMarkdownTextWithMode(text, limit, "newline");

// markdown 模式：保持 Markdown 格式
const blockChunks = chunkMarkdownTextWithMode(text, limit, "newline");
```

### 5.5 会话镜像

发送成功后自动更新会话记录：

```typescript
if (params.mirror && results.length > 0) {
  await appendAssistantMessageToSessionTranscript({
    agentId: params.mirror.agentId,
    sessionKey: params.mirror.sessionKey,
    text: mirrorText,
    mediaUrls: mirrorMediaUrls,
    idempotencyKey: params.mirror.idempotencyKey,
  });
}
```

---

## 参考文件索引

| 文件 | 职责 |
|------|------|
| `src/cli/program/register.message.ts` | 命令注册 |
| `src/cli/program/message/helpers.ts` | CLI Helper 封装 |
| `src/commands/message.ts` | 命令入口协调 |
| `src/infra/outbound/message-action-runner.ts` | Action 调度核心 |
| `src/infra/outbound/outbound-send-service.ts` | 发送执行服务 |
| `src/infra/outbound/deliver.ts` | 投递执行引擎 |
| `src/infra/outbound/delivery-queue.ts` | 发送队列与恢复 |
| `src/infra/outbound/channel-selection.ts` | 通道选择策略 |
| `src/infra/outbound/target-resolver.ts` | 目标解析 |
| `src/infra/outbound/message.ts` | 消息发送核心 |
| `src/channels/plugins/message-actions.ts` | 通道消息动作分发 |
| `src/channels/plugins/outbound/load.ts` | 适配器加载器 |
| `src/channels/plugins/outbound/direct-text-media.ts` | 直接文本媒体适配器 |
| `src/channels/plugins/types.ts` | 通道类型定义 |

---

*文档生成日期：2026-04-28*
*对应源码版本：main 分支*
