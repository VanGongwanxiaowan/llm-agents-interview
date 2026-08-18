/**
 * Mini OpenClaw - 精简版 AI Agent 框架
 *
 * 这个文件是整个框架的入口点，类似于原始的 src/entry.ts
 *
 * 设计目的：
 * - 展示 OpenClaw 的核心架构
 * - 保留关键设计决策和工程细节
 * - 去除复杂的边界情况处理
 *
 * 核心模块：
 * 1. Gateway - 消息路由中心
 * 2. Agent - AI 对话处理
 * 3. Channel - 消息渠道接入
 * 4. Plugin - 扩展机制
 *
 * 为什么用 TypeScript：
 * - 类型安全，减少运行时错误
 * - IDE 支持好，代码提示准确
 * - 便于重构和维护
 */

// ============================================================================
// 第一部分：类型定义 - 定义整个框架的数据结构
// ============================================================================

/**
 * 消息内容
 * 统一所有渠道的消息格式
 *
 * 为什么需要统一格式：
 * - Telegram、Discord、WhatsApp 的消息格式各不相同
 * - 如果不统一，上层代码需要为每个渠道写不同的处理逻辑
 * - 有了统一格式，Agent 只需要处理一种格式
 */
export interface Message {
  id: string;                    // 消息唯一ID
  role: "user" | "assistant";   // 角色：用户 or AI助手
  content: string;              // 消息内容
  timestamp: Date;              // 时间戳
}

/**
 * 会话（Session）
 * 保存与用户的一次完整对话
 *
 * Session 的设计考量：
 * - 对话需要跨越多轮，保持上下文
 * - 需要保存消息历史
 * - 需要知道是哪个 Agent 在处理
 *
 * 不这样做的后果：
 * - 每次消息都像是新的对话
 * - AI 无法理解对话上下文
 */
export interface Session {
  id: string;                    // 会话唯一标识
  agentId: string;              // 关联的 Agent ID
  messages: Message[];          // 消息历史
  createdAt: Date;              // 创建时间
  metadata?: Record<string, unknown>; // 元数据（来源渠道、用户信息等）
}

/**
 * Agent 配置
 * 定义 AI 对话代理的行为
 */
export interface AgentConfig {
  id: string;                   // Agent 唯一标识
  name: string;                 // Agent 名称
  model: string;                // 使用的模型（如 "claude-sonnet-4-20250514"）
  provider: string;             // 模型提供商（如 "anthropic"）
  systemPrompt: string;         // 系统提示词（定义 AI 的角色和行为）
  tools: string[];              // 可用的工具列表
}

/**
 * Channel 配置
 * 定义消息渠道的行为
 *
 * Channel 是插件式的
 * 每个渠道（Telegram/Discord）都有自己的实现
 */
export interface ChannelConfig {
  id: string;                   // 渠道 ID（如 "telegram"）
  enabled: boolean;             // 是否启用
}

/**
 * 工具（Tool）
 * Agent 可以调用的外部能力
 *
 * 为什么需要 Tool：
 * - AI 模型只能生成文本
 * - Tool 让 AI 可以执行实际操作（读文件、执行命令、搜索网页）
 * - 这是 Agent 和普通 LLM 的核心区别
 */
export interface Tool {
  name: string;                 // 工具名称
  description: string;           // 描述，AI 会看到这个来决定是否调用
  parameters: Record<string, {   // 参数 schema
    type: string;
    description?: string;
    required?: boolean;
  }>;
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  sessionId: string;            // 当前会话 ID
  agentId: string;              // 当前 Agent ID
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

// ============================================================================
// 第二部分：Provider - AI 模型提供商抽象
// ============================================================================

/**
 * AI 模型提供商接口
 *
 * 设计决策：
 * - 抽象出 Provider 接口，这样就可以支持多个 AI 模型
 * - 今天用 Claude，明天想用 GPT，只需要改配置，不需要改代码
 * - 每个 Provider 有自己的 API 格式，我们统一抽象后，上层代码不需要关心
 *
 * 不这样做的后果：
 * - 代码中散布着 Anthropic、OpenAI 的 API 调用
 * - 想换模型需要改很多地方
 * - 测试时无法 mock 不同的 Provider
 */
export interface LLMProvider {
  id: string;

  /**
   * 调用模型生成回复
   *
   * @param model - 模型 ID
   * @param messages - 对话历史
   * @param systemPrompt - 系统提示
   * @returns 生成的文本回复
   */
  generate(
    model: string,
    messages: Message[],
    systemPrompt: string
  ): Promise<string>;

  /**
   * 调用模型生成回复（流式版本）
   *
   * 为什么要支持流式：
   * - 流式响应可以让用户看到 AI 正在"思考"
   * - 减少感知延迟
   * - 提供更好的用户体验
   */
  generateStream?(
    model: string,
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void>;
}

// ============================================================================
// 第三部分：Plugin 系统 - 扩展机制
// ============================================================================

/**
 * 插件清单
 *
 * 这是插件的"身份证"
 * OpenClaw 在加载插件代码之前先读取这个清单
 *
 * 为什么 manifest-first：
 * 1. 配置验证可以在代码加载前完成
 * 2. 不需要执行插件就能知道插件的能力
 * 3. 用于插件市场、搜索、权限控制
 *
 * 不这样做的后果：
 * - 配置错误会导致插件加载失败
 * - 无法在启动前验证配置有效性
 */
export interface PluginManifest {
  id: string;                   // 插件唯一标识
  name: string;                 // 插件名称
  version: string;              // 版本号
  description?: string;         // 描述
  channels?: string[];          // 提供的渠道列表
  providers?: string[];         // 提供的 Provider 列表
  tools?: Tool[];               // 提供的工具列表

  /**
   * 激活方式
   * onStartup: 是否在 Gateway 启动时激活
   * 按需激活可以减少启动时间
   */
  activation?: {
    onStartup?: boolean;
  };
}

/**
 * 插件运行时
 *
 * 加载代码后的实际插件实例
 */
export interface PluginRuntime {
  manifest: PluginManifest;

  /**
   * 激活插件
   * 在插件被使用时调用
   */
  activate?(): Promise<void>;

  /**
   * 停用插件
   * 在插件不再需要时调用
   */
  deactivate?(): Promise<void>;
}

// ============================================================================
// 第四部分：Hook 系统 - 生命周期干预
// ============================================================================

/**
 * Hook 类型定义
 *
 * Hook 允许插件在消息处理的各个环节干预行为
 *
 * 为什么需要 Hook：
 * - 修改消息处理流程（不改变核心代码）
 * - 添加日志、监控、分析
 * - 实现访问控制、内容过滤
 * - 注入额外的上下文信息
 *
 * Hook 执行顺序：
 * - 按 priority 从低到高执行
 * - 如果某个 Hook 返回 blocked，后续 Hook 不会执行
 *
 * 为什么不这样做：
 * - 如果没有 Hook，想要修改行为只能改核心代码
 * - 每次升级都需要手动合并修改
 * - 无法动态添加/移除功能
 */

/**
 * Hook 事件类型
 * 覆盖了消息处理的完整生命周期
 */
export type HookName =
  | "before_agent_start"      // Agent 启动前
  | "before_prompt_build"     // 构建提示词前
  | "llm_input"               // LLM 输入前
  | "llm_output"              // LLM 输出后
  | "before_tool_call"        // 工具调用前
  | "after_tool_call"         // 工具调用后
  | "before_agent_reply"      // Agent 回复前
  | "after_agent_finalize";   // Agent 结束后

/**
 * Hook 处理函数接口
 */
export interface HookHandler {
  name: HookName;
  priority: number;            // 优先级，数字越小越先执行
  handler: (event: HookEvent, context: HookContext) => Promise<HookResult>;
}

/**
 * Hook 事件
 * 根据 Hook 类型不同，包含不同的数据
 */
export type HookEvent =
  | { type: "before_agent_start"; sessionId: string; agentId: string }
  | { type: "llm_input"; messages: Message[]; systemPrompt: string }
  | { type: "llm_output"; response: string }
  | { type: "before_tool_call"; toolName: string; params: Record<string, unknown> }
  | { type: "after_tool_call"; toolName: string; result: ToolResult }
  | { type: "before_agent_reply"; reply: string };

export interface HookContext {
  sessionId: string;
  agentId: string;
  timestamp: Date;
}

export interface HookResult {
  // 是否阻止继续处理
  blocked?: boolean;
  // 如果 blocked，阻止的原因
  reason?: string;
  // 可以修改的事件数据
  modifiedEvent?: HookEvent;
  // 可以返回替代的回复
  overrideReply?: string;
}

/**
 * Hook 运行器
 *
 * 负责注册和执行所有 Hook
 */
export class HookRunner {
  // 存储所有注册的 Hook
  private handlers: Map<HookName, HookHandler[]> = new Map();

  /**
   * 注册一个 Hook
   */
  register(handler: HookHandler): void {
    const handlers = this.handlers.get(handler.name) ?? [];
    handlers.push(handler);
    // 按 priority 排序
    handlers.sort((a, b) => a.priority - b.priority);
    this.handlers.set(handler.name, handlers);
  }

  /**
   * 执行指定类型的 Hook
   *
   * 执行策略：
   * 1. 获取所有该类型的 Handler
   * 2. 按 priority 顺序执行
   * 3. 如果某个 Handler 返回 blocked，停止执行
   * 4. 收集所有 Handler 的修改
   */
  async run(name: HookName, event: HookEvent, context: HookContext): Promise<HookResult> {
    const handlers = this.handlers.get(name) ?? [];

    let finalResult: HookResult = { blocked: false };

    for (const handler of handlers) {
      try {
        const result = await handler.handler(event, context);

        // 如果 Handler 返回 blocked，直接返回
        if (result.blocked) {
          return result;
        }

        // 合并修改
        if (result.modifiedEvent) {
          event = result.modifiedEvent;
        }

        // 收集 override reply
        if (result.overrideReply) {
          finalResult.overrideReply = result.overrideReply;
        }
      } catch (error) {
        // Hook 执行出错，不阻止流程，只记录错误
        console.error(`Hook ${handler.name} failed:`, error);
      }
    }

    return finalResult;
  }
}

// ============================================================================
// 第五部分：Agent - AI 对话处理核心
// ============================================================================

/**
 * Agent 运行时
 *
 * 负责：
 * 1. 维护会话上下文
 * 2. 调用 LLM 生成回复
 * 3. 处理工具调用
 * 4. 管理消息历史
 *
 * 设计决策：
 * - Agent 是有状态的，需要维护 messages 数组
 * - 使用事件驱动的工具调用
 * - 支持多轮对话
 */
export class Agent {
  config: AgentConfig;
  private provider: LLMProvider;
  private tools: Map<string, Tool> = new Map();
  private hookRunner?: HookRunner;

  constructor(
    config: AgentConfig,
    provider: LLMProvider,
    tools: Tool[] = [],
    hookRunner?: HookRunner
  ) {
    this.config = config;
    this.provider = provider;
    this.hookRunner = hookRunner;

    // 注册工具到 Map，方便快速查找
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * 处理用户消息，生成回复
   *
   * 这是 Agent 的核心方法
   * 处理流程：
   * 1. 创建 Hook 上下文
   * 2. 执行 before_agent_start Hook
   * 3. 构建 Prompt
   * 4. 调用 LLM
   * 5. 处理工具调用（如果有）
   * 6. 执行 before_agent_reply Hook
   * 7. 返回回复
   */
  async processMessage(
    session: Session,
    userMessage: string
  ): Promise<string> {
    const context: HookContext = {
      sessionId: session.id,
      agentId: this.config.id,
      timestamp: new Date(),
    };

    // 1. 执行 before_agent_start Hook
    // 插件可以在这个时候修改 session 或注入额外信息
    if (this.hookRunner) {
      const beforeStartResult = await this.hookRunner.run(
        "before_agent_start",
        { type: "before_agent_start", sessionId: session.id, agentId: this.config.id },
        context
      );
      if (beforeStartResult.blocked) {
        return `抱歉，暂时无法处理请求: ${beforeStartResult.reason}`;
      }
    }

    // 2. 添加用户消息到历史
    session.messages.push({
      id: this.generateId(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    });

    // 3. 执行 before_prompt_build Hook
    // 插件可以在这个时候修改 system prompt 或注入上下文
    let systemPrompt = this.config.systemPrompt;
    if (this.hookRunner) {
      const promptResult = await this.hookRunner.run(
        "before_prompt_build",
        { type: "llm_input", messages: session.messages, systemPrompt },
        context
      );
      if (promptResult.modifiedEvent) {
        // 如果 Hook 修改了事件，更新 systemPrompt
        systemPrompt = (promptResult.modifiedEvent as any).systemPrompt ?? systemPrompt;
      }
    }

    // 4. 调用 LLM 生成回复
    // 这里可能会触发多次工具调用，形成循环
    let assistantReply = await this.callLLM(session.messages, systemPrompt);

    // 5. 执行 before_agent_reply Hook
    // 插件可以在这个时候修改回复内容
    if (this.hookRunner) {
      const replyResult = await this.hookRunner.run(
        "before_agent_reply",
        { type: "before_agent_reply", reply: assistantReply },
        context
      );
      if (replyResult.overrideReply) {
        assistantReply = replyResult.overrideReply;
      }
    }

    // 6. 添加助手回复到历史
    session.messages.push({
      id: this.generateId(),
      role: "assistant",
      content: assistantReply,
      timestamp: new Date(),
    });

    return assistantReply;
  }

  /**
   * 调用 LLM 并处理工具调用
   *
   * 这是一个循环：
   * - 调用 LLM
   * - 如果 LLM 返回工具调用，执行工具
   * - 把工具结果加入消息历史
   * - 再次调用 LLM
   * - 直到 LLM 返回普通回复
   */
  private async callLLM(messages: Message[], systemPrompt: string): Promise<string> {
    // 设置最大循环次数，防止无限循环
    const MAX_TOOL_CALLS = 10;

    for (let i = 0; i < MAX_TOOL_CALLS; i++) {
      // 调用 LLM
      const response = await this.provider.generate(
        this.config.model,
        messages,
        systemPrompt
      );

      // 检查是否包含工具调用
      // 不同的 Provider 格式可能不同，这里简化处理
      const toolCalls = this.parseToolCalls(response);

      if (toolCalls.length === 0) {
        // 没有工具调用，返回普通回复
        return response;
      }

      // 执行工具调用
      for (const toolCall of toolCalls) {
        const context: ToolContext = {
          sessionId: messages[0]?.id ?? "",
          agentId: this.config.id,
        };

        // 执行 before_tool_call Hook
        if (this.hookRunner) {
          await this.hookRunner.run(
            "before_tool_call",
            { type: "before_tool_call", toolName: toolCall.name, params: toolCall.params },
            context
          );
        }

        // 执行工具
        const tool = this.tools.get(toolCall.name);
        if (!tool) {
          messages.push({
            id: this.generateId(),
            role: "assistant",
            content: `Error: Unknown tool "${toolCall.name}"`,
            timestamp: new Date(),
          });
          continue;
        }

        const result = await tool.handler(toolCall.params, context);

        // 执行 after_tool_call Hook
        if (this.hookRunner) {
          await this.hookRunner.run(
            "after_tool_call",
            { type: "after_tool_call", toolName: toolCall.name, result },
            context
          );
        }

        // 把工具结果加入消息历史
        messages.push({
          id: this.generateId(),
          role: "assistant",
          content: JSON.stringify({
            tool: toolCall.name,
            result: result.success ? result.output : result.error,
          }),
          timestamp: new Date(),
        });
      }
    }

    // 达到最大循环次数，返回错误信息
    return "抱歉，问题太复杂了，我无法完成回答。";
  }

  /**
   * 解析 LLM 返回中的工具调用
   *
   * 这是一个简化版本
   * 真实实现需要解析各种格式（JSON、XML 等）
   */
  private parseToolCalls(response: string): Array<{ name: string; params: Record<string, unknown> }> {
    // 简化：查找 ```tool_call ... ``` 格式
    const toolCallRegex = /```tool_call\n([\s\S]*?)\n```/g;
    const matches = [];
    let match;

    while ((match = toolCallRegex.exec(response)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        matches.push(parsed);
      } catch {
        // 解析失败，跳过
      }
    }

    return matches;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// ============================================================================
// 第六部分：Channel - 消息渠道接入
// ============================================================================

/**
 * Channel 运行时接口
 *
 * 所有消息渠道（Telegram、Discord 等）都实现这个接口
 *
 * 为什么需要统一的接口：
 * - 上层代码（Gateway、Agent）不需要关心消息来自哪个渠道
 * - 新增渠道只需要实现这个接口，不需要修改其他代码
 * - 便于测试，可以 mock Channel
 *
 * 不这样做的后果：
 * - Gateway 代码中散布着各种渠道的特殊处理
 * - 新增渠道需要修改很多地方
 * - 测试时无法统一 mock
 */
export interface ChannelRuntime {
  id: string;                    // 渠道 ID

  /**
   * 启动渠道监听
   * 开始接收消息
   */
  start(): Promise<void>;

  /**
   * 停止渠道监听
   * 释放资源
   */
  stop(): Promise<void>;

  /**
   * 发送消息到指定目标
   */
  send(target: string, message: string): Promise<void>;

  /**
   * 设置消息处理器
   * 当收到消息时调用
   */
  onMessage(handler: (target: string, message: string) => void): void;
}

/**
 * Telegram Channel 实现
 *
 * 这是一个简化版本
 * 真实实现需要处理 Telegram Bot API 的各种细节
 */
export class TelegramChannel implements ChannelRuntime {
  id = "telegram";
  private botToken: string;
  private messageHandler?: (target: string, message: string) => void;
  private pollingInterval?: NodeJS.Timeout;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  /**
   * 启动轮询监听消息
   *
   * 为什么用轮询（Polling）：
   * - Telegram 提供两种方式：Webhook 和 Polling
   * - Polling 简单，不需要 HTTPS
   * - Webhook 需要公网 HTTPS，配置复杂
   *
   * 轮询的缺点：
   - 有延迟（取决于轮询间隔）
   - 需要定期请求 API
   * + 简单，适合个人使用
   */
  async start(): Promise<void> {
    console.log(`[Telegram] Starting bot with token: ${this.botToken.substring(0, 10)}...`);

    // 开始轮询
    this.pollingInterval = setInterval(async () => {
      await this.pollUpdates();
    }, 1000);
  }

  /**
   * 轮询获取新消息
   *
   * 这是简化的实现
   * 真实实现需要：
   * - 维护 offset，避免重复处理消息
   * - 处理多种更新类型（message、callback_query 等）
   * - 错误处理和重试
   */
  private async pollUpdates(): Promise<void> {
    try {
      // 实际应该调用 Telegram API
      // 这里简化处理
      const updates = await this.fetchUpdates();

      for (const update of updates) {
        if (update.message && this.messageHandler) {
          const chatId = update.message.chat.id.toString();
          const text = update.message.text ?? "";
          this.messageHandler(chatId, text);
        }
      }
    } catch (error) {
      console.error("[Telegram] Poll error:", error);
    }
  }

  private async fetchUpdates(): Promise<any[]> {
    // 这里是占位符，实际需要调用 Telegram API
    // const response = await fetch(`https://api.telegram.org/bot${this.botToken}/getUpdates`);
    return [];
  }

  async stop(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    console.log("[Telegram] Bot stopped");
  }

  async send(target: string, message: string): Promise<void> {
    // 实际应该调用 Telegram API 发送消息
    console.log(`[Telegram] Sending to ${target}: ${message.substring(0, 50)}...`);
    // await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
    //   method: "POST",
    //   body: JSON.stringify({ chat_id: target, text: message }),
    // });
  }

  onMessage(handler: (target: string, message: string) => void): void {
    this.messageHandler = handler;
  }
}

// ============================================================================
// 第七部分：Gateway - 核心路由
// ============================================================================

/**
 * Gateway - 消息路由中心
 *
 * Gateway 是整个系统的核心：
 * - 管理所有 Agent 和 Channel
 * - 协调消息的流向
 * - 提供控制面板接口
 *
 * 消息流向：
 * User -> Channel -> Gateway -> Agent -> LLM -> (Tool) -> Agent -> Gateway -> Channel -> User
 *
 * 设计决策：
 * - Gateway 是单进程，这样延迟最低
 * - 单进程意味着简单，但也有限制（无法水平扩展）
 *
 * 不这样做的后果（如果用多进程）：
 * - 进程间通信增加延迟
 * - 部署和运维更复杂
 * - 对于个人使用来说，不需要水平扩展
 */
export class Gateway {
  private agents: Map<string, Agent> = new Map();
  private channels: Map<string, ChannelRuntime> = new Map();
  private sessions: Map<string, Session> = new Map();
  private plugins: Map<string, PluginRuntime> = new Map();
  private hookRunner: HookRunner = new HookRunner();

  constructor() {
    console.log("[Gateway] Initialized");
  }

  /**
   * 注册 Agent
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.config.id, agent);
    console.log(`[Gateway] Agent registered: ${agent.config.id}`);
  }

  /**
   * 注册 Channel
   */
  registerChannel(channel: ChannelRuntime): void {
    this.channels.set(channel.id, channel);

    // 设置 Channel 的消息处理器
    channel.onMessage((target, message) => {
      this.handleIncomingMessage(channel.id, target, message);
    });

    console.log(`[Gateway] Channel registered: ${channel.id}`);
  }

  /**
   * 注册 Plugin
   */
  registerPlugin(plugin: PluginRuntime): void {
    this.plugins.set(plugin.manifest.id, plugin);

    // 注册 Plugin 提供的工具
    if (plugin.manifest.tools) {
      for (const tool of plugin.manifest.tools) {
        // 找到对应的 Agent，注册工具
        // 简化处理，实际应该更复杂
      }
    }

    // 注册 Plugin 的 Hooks
    // 简化处理，实际应该从 plugin 获取 hooks

    console.log(`[Gateway] Plugin registered: ${plugin.manifest.id}`);
  }

  /**
   * 启动 Gateway
   */
  async start(): Promise<void> {
    console.log("[Gateway] Starting...");

    // 启动所有 Channel
    for (const channel of this.channels.values()) {
      await channel.start();
    }

    console.log("[Gateway] Started successfully");
  }

  /**
   * 停止 Gateway
   */
  async stop(): Promise<void> {
    console.log("[Gateway] Stopping...");

    // 停止所有 Channel
    for (const channel of this.channels.values()) {
      await channel.stop();
    }

    console.log("[Gateway] Stopped");
  }

  /**
   * 处理收到的消息
   *
   * 这是消息处理的入口
   * 根据目标找到对应的 Agent 处理
   */
  private async handleIncomingMessage(
    channelId: string,
    target: string,
    message: string
  ): Promise<void> {
    console.log(`[Gateway] Message from ${channelId}: ${message.substring(0, 50)}...`);

    // 解析会话 ID
    // 简化：使用 target 作为会话 ID
    // 真实实现需要更复杂的路由逻辑
    const sessionId = target;

    // 获取或创建 Session
    let session = this.sessions.get(sessionId);
    if (!session) {
      // 简化：使用第一个注册的 Agent
      const agent = Array.from(this.agents.values())[0];
      if (!agent) {
        console.error("[Gateway] No agent available");
        return;
      }

      session = {
        id: sessionId,
        agentId: agent.config.id,
        messages: [],
        createdAt: new Date(),
        metadata: { channelId },
      };
      this.sessions.set(sessionId, session);
    }

    // 找到对应的 Agent
    const agent = this.agents.get(session.agentId);
    if (!agent) {
      console.error(`[Gateway] Agent not found: ${session.agentId}`);
      return;
    }

    // 处理消息
    const reply = await agent.processMessage(session, message);

    // 发送回复
    const channel = this.channels.get(channelId);
    if (channel) {
      await channel.send(target, reply);
    }
  }
}

// ============================================================================
// 第八部分：工具实现示例
// ============================================================================

/**
 * 内置工具：bash - 执行 shell 命令
 *
 * 为什么需要这个工具：
 * - 让 AI 可以执行系统命令
 * - 可以用来做很多事情：文件操作、进程管理等
 *
 * 安全考虑：
 * - 需要限制可以执行的命令
 * - 需要限制执行时间
 * - 需要捕获输出
 */
export function createBashTool(): Tool {
  return {
    name: "bash",
    description: "Execute shell commands. Use this to run system commands.",

    // 参数 schema
    parameters: {
      command: {
        type: "string",
        description: "The shell command to execute",
        required: true,
      },
      timeout: {
        type: "number",
        description: "Maximum execution time in milliseconds",
        required: false,
      },
    },

    // 执行函数
    handler: async (params: Record<string, unknown>): Promise<ToolResult> => {
      const command = params.command as string;
      const timeout = (params.timeout as number) ?? 30000;

      // 安全检查：禁止危险命令
      const dangerousPatterns = ["rm -rf /", "mkfs", ":(){ :|:& };:", "dd if=/dev/zero"];
      for (const pattern of dangerousPatterns) {
        if (command.includes(pattern)) {
          return { success: false, error: `Command blocked for security: ${pattern}` };
        }
      }

      try {
        // 使用 Promise + timeout 实现超时控制
        const result = await withTimeout(
          executeCommand(command),
          timeout
        );

        return { success: true, output: result };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "TIMEOUT") {
            return { success: false, error: `Command timed out after ${timeout}ms` };
          }
          return { success: false, error: error.message };
        }
        return { success: false, error: "Unknown error" };
      }
    },
  };
}

/**
 * 执行 shell 命令
 *
 * 使用 Bun 或者 Node.js 的 child_process
 */
async function executeCommand(command: string): Promise<string> {
  // 这里简化处理，实际情况需要使用 child_process
  // const { stdout, stderr } = await exec(command);
  // return stdout + stderr;

  return `[Simulated] Would execute: ${command}`;
}

/**
 * 超时包装器
 *
 * 为什么需要这个：
 * - 命令可能执行很久，甚至卡住
 * - 需要有一种方式强制终止
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("TIMEOUT"));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * 内置工具：read - 读取文件
 */
export function createReadTool(): Tool {
  return {
    name: "read",
    description: "Read the contents of a file",

    parameters: {
      path: {
        type: "string",
        description: "The file path to read",
        required: true,
      },
    },

    handler: async (params: Record<string, unknown>): Promise<ToolResult> => {
      const path = params.path as string;

      // 安全检查：防止读取敏感文件
      const sensitivePaths = ["/etc/passwd", "/etc/shadow", ".env"];
      for (const sensitive of sensitivePaths) {
        if (path.includes(sensitive)) {
          return { success: false, error: `Access to ${sensitive} denied` };
        }
      }

      try {
        // 实际应该使用 fs.readFile
        // const content = await fs.readFile(path, "utf-8");
        return { success: true, output: `[Simulated] Would read file: ${path}` };
      } catch (error) {
        return { success: false, error: `Failed to read file: ${error}` };
      }
    },
  };
}

// ============================================================================
// 第九部分：Provider 实现示例
// ============================================================================

/**
 * 模拟 Provider
 *
 * 用于测试和开发
 * 真实 Provider 需要调用实际的 AI API
 */
export class MockProvider implements LLMProvider {
  id = "mock";
  private responses: string[] = [];
  private responseIndex = 0;

  constructor(responses?: string[]) {
    this.responses = responses ?? [
      "你好！有什么可以帮助你的吗？",
      "让我帮你查一下...",
      "这是一个有趣的問題，讓我思考一下...",
    ];
  }

  async generate(
    model: string,
    messages: Message[],
    systemPrompt: string
  ): Promise<string> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 简化：直接返回预设的响应
    // 真实实现需要调用 AI API

    const lastMessage = messages[messages.length - 1]?.content ?? "";

    // 简单的模式匹配来生成响应
    if (lastMessage.includes("你好") || lastMessage.includes("hello")) {
      return "你好！很高兴见到你！";
    }
    if (lastMessage.includes("天气")) {
      return "今天天气很好，适合出门！";
    }
    if (lastMessage.includes("帮助")) {
      return "我可以帮你做很多事情：\n1. 回答问题\n2. 写代码\n3. 搜索信息\n4. 执行命令";
    }

    // 返回默认响应
    return this.responses[this.responseIndex++ % this.responses.length];
  }

  async generateStream?(
    model: string,
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const response = await this.generate(model, messages, systemPrompt);

    // 模拟流式输出
    for (const char of response) {
      onChunk(char);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

// ============================================================================
// 第十部分：主程序入口
// ============================================================================

/**
 * 创建并启动一个简单的 OpenClaw 实例
 *
 * 这是演示用的 main 函数
 */
export async function main() {
  console.log("=== Mini OpenClaw ===");

  // 1. 创建 Gateway
  const gateway = new Gateway();

  // 2. 创建 Provider（这里使用模拟的）
  const provider = new MockProvider([
    "你好！我是 OpenClaw AI 助手。有什么可以帮助你的吗？",
  ]);

  // 3. 创建工具
  const tools = [
    createBashTool(),
    createReadTool(),
  ];

  // 4. 创建 Agent
  const agent = new Agent(
    {
      id: "assistant",
      name: "OpenClaw Assistant",
      model: "mock-model",
      provider: "mock",
      systemPrompt:
        "你是一个有用的 AI 助手。\n" +
        "当用户要求执行命令时，使用 bash 工具。\n" +
        "当用户要求读取文件时，使用 read 工具。",
      tools: ["bash", "read"],
    },
    provider,
    tools,
    gateway["hookRunner"] // 暴露 hookRunner 用于测试
  );

  // 5. 注册 Agent
  gateway.registerAgent(agent);

  // 6. 创建并注册 Channel（这里使用模拟的）
  const channel = new TelegramChannel("mock-token");
  gateway.registerChannel(channel);

  // 7. 启动 Gateway
  await gateway.start();

  // 8. 模拟收到消息
  console.log("\n=== Simulating a message ===");
  const session = {
    id: "test-session",
    agentId: "assistant",
    messages: [] as Message[],
    createdAt: new Date(),
  };

  const reply = await agent.processMessage(session, "你好！你能做什么？");
  console.log(`[Agent] Reply: ${reply}`);

  // 9. 停止 Gateway
  await gateway.stop();

  console.log("\n=== Done ===");
}

// ============================================================================
// 导出所有类型和类供外部使用
// ============================================================================

export {
  // 类型
  Message,
  Session,
  AgentConfig,
  ChannelConfig,
  Tool,
  ToolContext,
  ToolResult,
  PluginManifest,
  PluginRuntime,
  HookName,
  HookHandler,
  HookEvent,
  HookContext as HookContext,
  HookResult,
  LLMProvider,
  ChannelRuntime,
  Gateway,
  // Provider
  MockProvider,
  // 工具
  createBashTool,
  createReadTool,
};

// 如果直接运行此文件，执行 main 函数
if (typeof process !== "undefined" && import.meta.url?.includes(process.argv[1] ?? "")) {
  main().catch(console.error);
}