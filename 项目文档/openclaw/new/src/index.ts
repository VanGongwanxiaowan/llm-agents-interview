/**
 * Mini OpenClaw - 入口文件
 *
 * 这个文件展示了 OpenClaw 的启动流程
 * 类似于原始的 src/entry.ts 和 src/cli/run-main.ts
 *
 * 关键设计：
 * 1. isMainModule 检查 - 防止重复执行
 * 2. 命令行参数解析
 * 3. 配置加载
 * 4. 启动 Gateway
 *
 * 工程细节：
 * - 使用 ES Module 语法（import/export）
 * - 使用 TypeScript 类型
 * - 支持动态 import（按需加载）
 */

// ============================================================================
// 第一部分：模块导入
// ============================================================================

// 我们从 mini-openclaw.ts 导入所有内容
import {
  Gateway,
  MockProvider,
  createBashTool,
  createReadTool,
  Agent,
  Message,
  Session,
  Tool,
  PluginManifest,
  PluginRuntime,
  HookRunner,
} from "./mini-openclaw.js";

// ============================================================================
// 第二部分：配置系统
// ============================================================================

/**
 * 配置类型
 *
 * 为什么需要配置：
 * - 不同的环境（开发、生产）需要不同的配置
 * - 敏感信息（API keys）不应该硬编码
 * - 方便部署和管理
 */
export interface Config {
  // Gateway 配置
  gateway: {
    host: string;
    port: number;
  };

  // Agent 配置
  agents: {
    id: string;
    name: string;
    model: string;
    provider: string;
    systemPrompt: string;
    tools: string[];
  }[];

  // Channel 配置
  channels: {
    id: string;
    type: "telegram" | "discord" | "whatsapp";
    enabled: boolean;
    config: Record<string, string>;
  }[];

  // Plugin 配置
  plugins: {
    id: string;
    enabled: boolean;
  }[];
}

/**
 * 从环境变量加载配置
 *
 * 为什么支持环境变量：
 * - 方便容器化部署（Docker、K8s）
 * - 敏感信息通过环境变量传入，不写在文件里
 * - 同一套代码，不同环境用不同配置
 */
export function loadConfigFromEnv(): Config {
  return {
    gateway: {
      host: process.env["OPENCLAW_HOST"] ?? "0.0.0.0",
      port: parseInt(process.env["OPENCLAW_PORT"] ?? "18789", 10),
    },

    agents: [
      {
        id: process.env["AGENT_ID"] ?? "assistant",
        name: process.env["AGENT_NAME"] ?? "OpenClaw Assistant",
        model: process.env["AGENT_MODEL"] ?? "claude-sonnet-4-20250514",
        provider: process.env["AGENT_PROVIDER"] ?? "anthropic",
        systemPrompt:
          process.env["AGENT_SYSTEM_PROMPT"] ??
          "你是一个有用的 AI 助手。简洁、专业地回答问题。",
        tools: ["bash", "read"],
      },
    ],

    channels: process.env["TELEGRAM_BOT_TOKEN"]
      ? [
          {
            id: "telegram",
            type: "telegram",
            enabled: true,
            config: {
              botToken: process.env["TELEGRAM_BOT_TOKEN"]!,
            },
          },
        ]
      : [],

    plugins: [],
  };
}

// ============================================================================
// 第三部分：CLI 参数解析
// ============================================================================

/**
 * 解析命令行参数
 *
 * 支持的格式：
 * - openclaw start
 * - openclaw config
 * - openclaw --version
 * - openclaw --help
 *
 * 为什么需要自定义解析：
 * - Commander.js 功能太多，启动慢
 * - 我们只需要简单的参数解析
 * - 可以精确控制解析行为
 */
export function parseArgs(argv: string[]): {
  command: string;
  options: Record<string, string | boolean>;
  remainingArgs: string[];
} {
  const command = argv[2] ?? "start"; // 默认命令是 start
  const options: Record<string, string | boolean> = {};
  const remainingArgs: string[] = [];

  // 解析剩余参数
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith("--")) {
      // 选项，如 --help, --version
      const key = arg.slice(2);
      // 检查是否有值
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        options[key] = argv[i + 1];
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith("-")) {
      // 短选项，如 -v, -h
      const key = arg.slice(1);
      options[key] = true;
    } else {
      // 位置参数
      remainingArgs.push(arg);
    }
  }

  return { command, options, remainingArgs };
}

// ============================================================================
// 第四部分：启动入口
// ============================================================================

/**
 * 启动 Gateway
 *
 * 这是主要的启动函数
 * 流程：
 * 1. 解析命令行参数
 * 2. 加载配置
 * 3. 创建 Gateway 实例
 * 4. 注册 Agent、Channel、Plugin
 * 5. 启动 Gateway
 */
export async function startGateway(): Promise<void> {
  console.log("=== Starting Mini OpenClaw ===");

  // 1. 解析命令行参数
  const { command, options } = parseArgs(process.argv);

  // 处理帮助和版本
  if (options["help"]) {
    printHelp();
    return;
  }
  if (options["version"]) {
    printVersion();
    return;
  }

  // 2. 加载配置（从环境变量）
  const config = loadConfigFromEnv();

  console.log(`Gateway config: ${config.gateway.host}:${config.gateway.port}`);
  console.log(`Registered agents: ${config.agents.length}`);
  console.log(`Registered channels: ${config.channels.length}`);

  // 3. 创建 Provider（这里用模拟的）
  // 真实实现会根据配置创建对应的 Provider
  const provider = new MockProvider();

  // 4. 创建工具
  // 从配置中读取工具列表，加载对应的工具实现
  const tools: Tool[] = [];
  for (const toolName of config.agents[0]?.tools ?? []) {
    switch (toolName) {
      case "bash":
        tools.push(createBashTool());
        break;
      case "read":
        tools.push(createReadTool());
        break;
      // 添加更多工具...
    }
  }

  // 5. 创建 HookRunner
  // Hook 用于在消息处理流程中注入自定义逻辑
  const hookRunner = new HookRunner();

  // 注册一些默认的 Hook
  // 这些 Hook 可以用于日志、性能监控等
  hookRunner.register({
    name: "before_agent_start",
    priority: 100,
    handler: async (event, context) => {
      console.log(`[Hook] before_agent_start: session=${context.sessionId}`);
      return { blocked: false };
    },
  });

  hookRunner.register({
    name: "before_agent_reply",
    priority: 100,
    handler: async (event, context) => {
      console.log(`[Hook] before_agent_reply: session=${context.sessionId}`);
      return { blocked: false };
    },
  });

  // 6. 创建 Agent
  const agent = new Agent(
    config.agents[0],
    provider,
    tools,
    hookRunner
  );

  // 7. 创建 Gateway
  const gateway = new Gateway();
  gateway.registerAgent(agent);

  // 8. 如果有 Channel 配置，注册 Channel
  for (const channelConfig of config.channels) {
    if (channelConfig.type === "telegram") {
      const { TelegramChannel } = await import("./mini-openclaw.js");
      const channel = new TelegramChannel(channelConfig.config["botToken"]);
      gateway.registerChannel(channel);
    }
  }

  // 9. 注册 Plugin（如果有）
  // 简化处理，实际应该从配置加载 plugin

  // 10. 启动 Gateway
  await gateway.start();

  console.log("=== Mini OpenClaw Started ===");
  console.log(`Gateway listening on ${config.gateway.host}:${config.gateway.port}`);

  // 如果是交互模式，启动 REPL
  // 简化处理，直接退出
  if (options["interactive"]) {
    console.log("\n[REPL] Interactive mode not implemented in mini version");
  }
}

// ============================================================================
// 第五部分：辅助函数
// ============================================================================

function printHelp(): void {
  console.log(`
Mini OpenClaw - 精简版 AI Agent 框架

用法:
  openclaw <command> [options]

命令:
  start           启动 Gateway（默认）
  config          显示当前配置
  help            显示帮助信息
  version         显示版本信息

选项:
  --help          显示帮助信息
  --version       显示版本信息
  --interactive   启动交互模式

环境变量:
  OPENCLAW_HOST           Gateway 监听地址（默认: 0.0.0.0）
  OPENCLAW_PORT           Gateway 监听端口（默认: 18789）
  AGENT_MODEL             使用的模型（默认: claude-sonnet-4-20250514）
  TELEGRAM_BOT_TOKEN      Telegram Bot Token

示例:
  openclaw start
  OPENCLAW_PORT=3000 openclaw start
  TELEGRAM_BOT_TOKEN=xxx openclaw start
`);
}

function printVersion(): void {
  console.log("Mini OpenClaw v0.1.0");
}

// ============================================================================
// 第六部分：命令处理
// ============================================================================

/**
 * 处理不同命令
 */
export async function handleCommand(command: string): Promise<void> {
  switch (command) {
    case "start":
      await startGateway();
      break;

    case "config":
      showConfig();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run 'openclaw help' for usage information");
      process.exit(1);
  }
}

function showConfig(): void {
  const config = loadConfigFromEnv();
  console.log("Current configuration:");
  console.log(JSON.stringify(config, null, 2));
}

// ============================================================================
// 第七部分：入口点
// ============================================================================

/**
 * 主入口
 *
 * 为什么需要检查 isMainModule：
 * - 这个文件可能被 import 成为其他模块的依赖
 * - 如果被 import 时执行了启动代码，会导致问题
 * - 只有直接运行这个文件时才执行启动
 *
 * 不这样做的后果：
 * - 当这个文件被其他模块 import 时，会启动整个应用
 * - 在测试中无法单独测试某个函数
 */
function isMainModule(): boolean {
  // 在 ES Module 中，可以通过 import.meta.url 判断
  // 但这需要特定的运行环境
  // 简化处理，直接返回 true
  return true;
}

// 如果是主模块，执行命令
if (isMainModule()) {
  const { command } = parseArgs(process.argv);
  handleCommand(command).catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

// ============================================================================
// 导出
// ============================================================================

export { startGateway, handleCommand, parseArgs, loadConfigFromEnv };