# 05_Channel系统

## 1. 什么是 Channel？

**Channel（渠道）** 是 OpenClaw 连接外部消息系统的桥梁：

```
                    ┌──────────────────────────────────────┐
                    │           OpenClaw Gateway           │
                    │                                      │
   ┌─────────┐      │  ┌────────────────────────────────┐ │
   │Telegram │──────▶│  │           Channel Layer          │ │
   └─────────┘      │  │  (统一的消息格式转换)             │ │
   ┌─────────┐      │  └─────────────┬────────────────────┘ │
   │Discord  │──────▶│                │                      │
   └─────────┘      │                ▼                      │
   ┌─────────┐      │  ┌────────────────────────────────┐ │
   │WhatsApp│──────▶│  │           Agent Layer          │ │
   └─────────┘      │  │      (AI 对话处理)              │ │
                    │  └────────────────────────────────┘ │
                    └──────────────────────────────────────┘
```

**核心功能**：
- 接收外部消息（Telegram/Discord/...）
- 将消息转换为统一格式
- 发送回复回渠道
- 处理渠道特定的协议（webhook/polling）

---

## 2. Channel 架构

### 2.1 核心组件

```typescript
// Channel 运行时结构
interface ChannelRuntime {
  id: string;                    // 渠道 ID (如 "telegram")

  // 入站消息处理
  start(): Promise<void>;        // 启动监听
  stop(): Promise<void>;         // 停止监听

  // 出站消息发送
  send(channelTarget: string, message: OutboundMessage): Promise<void>;

  // 生命周期
  onUpdate(handler: (update: ChannelUpdate) => void): void;
}
```

### 2.2 消息格式统一

```typescript
// 统一的消息上下文
interface MessageContext {
  channelId: string;            // "telegram"
  channelType: ChatType;        // "direct" | "group" | "channel"

  sender: {
    id: string;
    username?: string;
    displayName?: string;
  };

  content: {
    text?: string;
    media?: MediaContent;
    command?: string;          // 命令前缀 /
  };

  thread?: {
    id?: string;               // 线程/话题 ID
    replyTo?: string;          // 回复目标
  };

  metadata: {
    messageId: string;
    timestamp: Date;
    raw: unknown;               // 原始消息
  };
}
```

---

## 3. Channel 实现示例：Telegram

### 3.1 Telegram Channel 结构

```
extensions/telegram/
├── src/
│   ├── channel.ts          # Channel 运行时主文件
│   ├── bot.ts              # Bot 创建和管理
│   ├── bot-handlers/       # 消息处理器
│   │   ├── runtime.ts      # 核心消息处理
│   │   └── debounce.ts     # 防抖处理
│   ├── bot-message-context/ # 消息上下文构建
│   ├── bot-message-dispatch/ # 消息分发
│   └── send.ts             # 发送消息
└── openclaw.plugin.json   # 插件清单
```

### 3.2 核心流程

```typescript
// extensions/telegram/src/channel.ts
export function createTelegramChannel(): ChannelRuntime {
  return {
    id: "telegram",
    bot: undefined as TelegramBot,

    async start() {
      // 1. 初始化 bot
      this.bot = await createTelegramBot(token);

      // 2. 设置更新处理器
      this.bot.on("message", handleMessage);

      // 3. 开始长轮询或设置 webhook
      await this.bot.startPolling();
    },

    async send(chatId: string, message: OutboundMessage) {
      await this.bot.api.sendMessage(chatId, message.text, {
        parse_mode: "Markdown",
        reply_markup: message.buttons,
      });
    }
  };
}
```

### 3.3 消息接收流程

```
Telegram Server
      │
      ▼
┌─────────────────────────────────────┐
│  bot.ts / bot-updates.ts           │
│  - getUpdates (polling)            │
│  - 或 webhook 接收                 │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  bot-handlers/runtime.ts            │
│  - 解析 Telegram Update             │
│  - 提取消息内容                      │
│  - 构建 MessageContext              │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  bot-message-context.ts             │
│  - 识别发送者                        │
│  - 处理回复目标                      │
│  - 注入渠道元数据                    │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  bot-message-dispatch.ts             │
│  - 分发到 Agent                      │
│  - 处理命令 (/start, /help)          │
│  - 处理自然语言消息                  │
└─────────────┬───────────────────────┘
              │
              ▼
         Agent 处理
```

---

## 4. Channel 注册与管理

### 4.1 注册表

```typescript
// src/channels/registry.ts
export class ChannelRegistry {
  private channels = new Map<string, ChannelRuntime>();

  register(channel: ChannelRuntime): void {
    this.channels.set(channel.id, channel);
  }

  get(channelId: string): ChannelRuntime | undefined {
    return this.channels.get(channelId);
  }

  list(): ChannelRuntime[] {
    return Array.from(this.channels.values());
  }
}
```

### 4.2 配置驱动

```yaml
# openclaw.yaml
channels:
  telegram:
    enabled: true
    botToken: ${TELEGRAM_BOT_TOKEN}

  discord:
    enabled: true
    botToken: ${DISCORD_BOT_TOKEN}
```

---

## 5. 入站消息处理

### 5.1 消息解析

```typescript
// src/channels/message/parser.ts
export interface ParsedMessage {
  type: "command" | "text" | "media" | "callback";
  content: string;
  raw: RawMessage;
  attachments?: Attachment[];
}
```

### 5.2 命令识别

```typescript
// 命令格式：/command 或 /command@botname
const COMMAND_PATTERN = /^\/(\w+)(?:@(\w+))?(.*)$/;

function parseCommand(text: string): Command | null {
  const match = text.match(COMMAND_PATTERN);
  if (!match) return null;

  return {
    name: match[1],
    botName: match[2],
    args: match[3].trim(),
  };
}
```

### 5.3 防抖处理

```typescript
// src/channels/inbound-debounce-policy.ts
// 防止同一用户的重复消息被处理多次
export class InboundDebouncePolicy {
  private recentMessages = new Map<string, number>();

  shouldProcess(senderId: string, messageId: string): boolean {
    const key = `${senderId}:${messageId}`;
    if (this.recentMessages.has(key)) {
      return false;  // 已经在处理中
    }

    this.recentMessages.set(key, Date.now());
    setTimeout(() => this.recentMessages.delete(key), 5000);

    return true;
  }
}
```

---

## 6. 出站消息发送

### 6.1 消息队列

```typescript
// 出站消息先进入队列，再发送
// 避免高并发时消息丢失
interface OutboundQueue {
  enqueue(target: string, message: OutboundMessage): Promise<void>;
  process(): void;  // 后台处理
}
```

### 6.2 发送策略

```typescript
// src/channels/send.ts
export class ChannelSender {
  async send(target: string, message: OutboundMessage): Promise<void> {
    // 1. 速率限制检查
    if (!this.rateLimiter.canSend(target)) {
      await this.rateLimiter.wait();
    }

    // 2. 发送消息
    try {
      await this.channel.send(target, message);
    } catch (error) {
      // 3. 失败重试
      await this.retry(target, message, error);
    }
  }
}
```

### 6.3 回复参数

```typescript
// 回复参数（Reply Parameters）
interface ReplyParams {
  replyToId?: string;        // 回复到某条消息
  quote?: boolean;           // 引用原文
  parseMode?: "Markdown" | "HTML";
  buttons?: InlineKeyboard;   // 按钮
  silent?: boolean;          // 静默发送（不通知用户）
}
```

---

## 7. 会话绑定 (Session Binding)

### 7.1 路由决策

```typescript
// src/channels/conversation-binding-context.ts
export function resolveSessionKey(context: MessageContext): string {
  // 同一会话的消息路由到同一个 session
  // DM: sender
  // Group: sender + thread
  // Channel: channel + thread
}
```

### 7.2 线程绑定

```typescript
// src/channels/thread-binding-id.ts
// 支持渠道特定的线程/话题机制
interface ThreadBinding {
  channelType: string;
  threadId: string | null;
  parentId?: string;
}
```

---

## 8. Channel 特定功能

### 8.1 Telegram 特有

- **群组管理**：allowlist、命令前缀
- **主题/话题**：支持 Forum topics
- **Inline Keyboard**：按钮交互
- **Callback Query**：回调查询

### 8.2 Discord 特有

- **Guild/Channel 层级**
- **Role 权限**
- **Slash Commands**
- **Embeds 消息**

### 8.3 通用功能

- **@提及检测**
- **命令栅栏（Command Gating）**
- **消息草稿预览**
- **Typing 指示**

---

## 9. Channel 生命周期

```
Channel 生命周期：

创建 (Create)
    │
    ▼
配置 (Configure)
    │
    ▼
启动 (Start)
    │    │
    ▼    ▼
  运行  错误
    │    │
    │    ▼
    │  重试/告警
    │
    ▼
停止 (Stop)
    │
    ▼
清理 (Cleanup)
```

---

## 10. Channel 与 Plugin 的关系

### 10.1 Channel Plugin

```typescript
// Channel Plugin = Plugin + Channel 运行时
interface ChannelPlugin extends Plugin {
  channel: ChannelRuntime;
}
```

### 10.2 渠道发现

```typescript
// 从插件发现渠道
async function discoverChannels(): Promise<ChannelRuntime[]> {
  const plugins = await loadAllPlugins();
  return plugins
    .filter(p => p.channels)
    .flatMap(p => p.channels);
}
```

---

## 11. 配置示例

```yaml
channels:
  telegram:
    enabled: true
    botToken: ${TELEGRAM_BOT_TOKEN}
    pollingInterval: 1000
    allowedUpdates:
      - message
      - callback_query

  discord:
    enabled: true
    botToken: ${DISCORD_BOT_TOKEN}
    guildId: ${DISCORD_GUILD_ID}

  whatsapp:
    enabled: true
    # WhatsApp Business API 配置
```

---

## 12. 优点与缺点

### 优点

| 优点 | 说明 |
|------|------|
| **统一接口** | 不同渠道的消息被转换为统一格式 |
| **易于扩展** | 新增渠道只需要实现 Channel 接口 |
| **配置驱动** | 渠道配置与代码分离 |
| **完整功能** | 支持命令、媒体、按钮等 |

### 缺点

| 缺点 | 说明 |
|------|------|
| **渠道差异** | 某些渠道特性难以统一抽象 |
| **API 变化** | 渠道 API 变更需要同步更新 |
| **错误处理** | 不同渠道的错误处理方式不同 |
| **测试复杂** | 渠道测试需要 mock 外部 API |

---

## 13. 核心设计决策

| 决策 | 为什么这样做 | 不这样做的后果 |
|------|--------------|----------------|
| 统一消息格式 | 上层代码不需要感知渠道差异 | 每种渠道都要单独处理 |
| 配置驱动 | 渠道可以动态启用/禁用 | 硬编码导致灵活性差 |
| 插件式架构 | Channel 作为 Plugin 便于管理 | 与系统紧耦合 |
| 速率限制 | 防止渠道 API 被限流 | 消息发送失败 |
| 防抖机制 | 防止重复消息处理 | 重复响应用户 |

---

## 14. 下一步

学到这里，你应该对 OpenClaw 有了整体认知。接下来可以深入：

- [06_Gateway核心.md](./06_Gateway核心.md) - 理解网关核心
- [07_配置系统.md](./07_配置系统.md) - 理解配置管理
- [08_工具系统.md](./08_工具系统.md) - 深入工具实现