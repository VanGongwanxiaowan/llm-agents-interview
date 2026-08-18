# CLI 启动与命令框架详解

> 本文档通过 OpenClaw 项目源码，详细解析 `openclaw ...` 命令从输入到真正进入业务函数的全过程。通过学习这个设计，你可以掌握构建生产级 Node.js CLI 应用的架构经验：进程保护、环境隔离、快路径优化、懒加载注册、插件注入等核心模式。

---

## 目录

1. [整体执行链路概览](#1-整体执行链路概览)
2. [Step 1: 进程启动与环境保护 (`entry.ts`)](#step-1-进程启动与环境保护-entryts)
3. [Step 2: 运行前准备 (`run-main.ts`)](#step-2-运行前准备-run-maints)
4. [Step 3: 快路径路由 (`route.ts`)](#step-3-快路径路由-routets)
5. [Step 4: 构建 Commander 程序 (`build-program.ts`)](#step-4-构建-commander-程序-build-programts)
6. [Step 5: 命令注册器与懒加载 (`command-registry.ts`)](#step-5-命令注册器与懒加载-command-registryts)
7. [Step 6: Pre-Action 钩子与上下文注入](#step-6-pre-action-钩子与上下文注入)
8. [Step 7: 执行目标命令](#step-7-执行目标命令)
9. [设计亮点总结](#设计亮点总结)

---

## 1. 整体执行链路概览

```
用户输入: openclaw message send --target +15555550123 --message "Hi"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 1: entry.ts (入口保护)                                          │
│  - 设置 process.title = "openclaw"                                   │
│  - 处理 --no-color 环境变量                                           │
│  - 检测 ExperimentalWarning 并决定是否 respawn                       │
│  - fast-path: --version 直接输出版本号退出                           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 2: run-main.ts (进程重spawn)                                   │
│  - 如果需要抑制警告，重spawn子进程并传递 --disable-warning            │
│  - 父进程等待子进程退出                                              │
│  - 子进程继续执行 runCli()                                           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 3: runCli() in run-main.ts (主逻辑开始)                        │
│  - loadDotEnv() / normalizeEnv()                                     │
│  - ensureOpenClawCliOnPath()                                         │
│  - assertSupportedRuntime()                                          │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 4: tryRouteCli() (快路径路由)                                  │
│  - 检查是否是 health/status/sessions/models list 等快速命令          │
│  - 如果命中快路径，直接执行命令，跳过完整 Commander 解析              │
│  - 返回 true 表示已处理，runCli() 直接 return                        │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                    ┌─────────────┘ (未命中快路径)
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 5: buildProgram() (构建 Commander 程序)                        │
│  - new Command()                                                     │
│  - setProgramContext() (Symbol-based 上下文共享)                     │
│  - configureProgramHelp()                                            │
│  - registerPreActionHooks() (注册 preAction 钩子)                   │
│  - registerProgramCommands() (注册所有命令)                          │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 6: registerProgramCommands()                                   │
│  - registerCoreCliCommands() (内置命令，懒加载)                      │
│    - message, agent, config, status, health, sessions, memory ...     │
│  - registerSubCliCommands() (子CLI扩展命令)                           │
│  - registerPluginCliCommands() (插件注入命令)                       │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 7: program.parseAsync() (解析并执行)                           │
│  - Commander 解析 argv                                               │
│  - 触发 preAction 钩子 (配置加载、插件加载)                          │
│  - 命中 lazy command 时：先移除占位符，再真正注册，最后重新解析      │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 8: 执行命令 (例如 message send)                                │
│  - runMessageAction() → message-action-runner.ts                    │
│  - 通道选择 → 目标解析 → 发送执行 → 通道适配器                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Step 1: 进程启动与环境保护 (`entry.ts`)

**文件:** `src/entry.ts`

这是整个 CLI 的入口文件。当用户执行 `openclaw <command>` 时，操作系统首先加载这个文件。

### 2.1 进程标题与环境标记

```typescript
process.title = "openclaw";
ensureOpenClawExecMarkerOnProcess();
installProcessWarningFilter();
normalizeEnv();
```

- `process.title = "openclaw"` — 将进程名设为 `openclaw`，方便 `ps` / `top` 识别
- `ensureOpenClawExecMarkerOnProcess()` — 在 process 对象上打标记，表示正在以 OpenClaw CLI 身份运行（用于检测是否被其他工具调用）
- `installProcessWarningFilter()` — 过滤 Node.js 运行时产生的警告

### 2.2 编译缓存（可选）

```typescript
if (!isTruthyEnvValue(process.env.NODE_DISABLE_COMPILE_CACHE)) {
  try {
    enableCompileCache();
  } catch {
    // Best-effort only; never block startup.
  }
}
```

`enableCompileCache()` 启用 Node.js 内置的 V8 代码编译缓存，加速重复启动。

### 2.3 `--no-color` 处理

```typescript
if (process.argv.includes("--no-color")) {
  process.env.NO_COLOR = "1";
  process.env.FORCE_COLOR = "0";
}
```

兼容用户传递的 `--no-color` 参数，将颜色输出关闭。

### 2.4 ExperimentalWarning 抑制 — Respawn 模式

这是整个 CLI 启动最精妙的部分。Node.js 的 `--experimental-vm-modules` 等实验性功能会触发 `ExperimentalWarning`，影响用户体验。OpenClaw 通过 **respawn**（重新生成子进程）来抑制这个警告。

```typescript
function ensureExperimentalWarningSuppressed(): boolean {
  // ... 多重跳过条件检查 ...

  // 满足任一条件则跳过 respawn：
  // 1. hasExperimentalWarningSuppressed() — 已经有 --disable-warning
  // 2. shouldSkipRespawnForArgv(argv) — help/version 参数不重spawn
  // 3. OPENCLAW_NO_RESPAWN 环境变量
  // 4. OPENCLAW_NODE_OPTIONS_READY 环境变量（防止递归）

  // 需要重spawn
  process.env.OPENCLAW_NODE_OPTIONS_READY = "1"; // 递归保护
  const child = spawn(
    process.execPath,
    [EXPERIMENTAL_WARNING_FLAG, ...process.execArgv, ...process.argv.slice(1)],
    { stdio: "inherit", env: process.env },
  );

  // 父进程：将子进程的退出码透传给父进程
  child.once("exit", (code, signal) => {
    if (signal) {
      process.exitCode = 1;
      return;
    }
    process.exit(code ?? 1);
  });

  return true; // 表示进行了 respawn，父进程需要退出
}
```

**为什么需要传递 `--disable-warning=ExperimentalWarning` 而不是用 `NODE_OPTIONS`？**

因为 `--disable-warning` 是 CLI 选项，不能通过环境变量传递。Node.js 要求这类警告抑制标志必须作为命令行参数传入。

**递归保护机制：**

```
父进程（original）                    子进程（respawned）
    │                                      │
    │ env: OPENCLAW_NODE_OPTIONS_READY=1  │
    │ argv: --disable-warning ...         │
    ▼                                      ▼
    │                              (hasExperimentalWarningSuppressed() = true)
    │                              → 不再 respawn，正常执行 runCli()
    ▼
  父进程 exit(code)
```

子进程检测到 `OPENCLAW_NODE_OPTIONS_READY` 已设置，知道自己已经被 respawn 过，跳过二次 respawn。

### 2.5 版本号快路径

```typescript
if (isRootVersionInvocation(argv)) {
  Promise.all([import("./version.js"), import("./infra/git-commit.js")])
    .then(([{ VERSION }, { resolveCommitHash }]) => {
      const commit = resolveCommitHash({ moduleUrl: import.meta.url });
      console.log(commit ? `OpenClaw ${VERSION} (${commit})` : `OpenClaw ${VERSION}`);
      process.exit(0);
    });
  return;
}
```

`openclaw --version` 直接打印版本号，不需要加载完整 Commander 和配置。

---

## 3. Step 2: 运行前准备 (`run-main.ts`)

**文件:** `src/cli/run-main.ts`

### 3.1 入口保护 — 防止重复执行

```typescript
if (
  !isMainModule({
    currentFile: fileURLToPath(import.meta.url),
    wrapperEntryPairs: [...ENTRY_WRAPPER_PAIRS],
  })
) {
  // Imported as a dependency — skip all entry-point side effects.
} else {
  // 执行 CLI 入口逻辑
}
```

`isMainModule` 检查当前文件是否是真正的入口点（而不是被其他模块作为依赖导入）。这对 bundler 场景很重要：`dist/index.js` 可能是真正的入口，`entry.ts` 作为依赖被 import，如果不加保护会导致重复启动。

### 3.2 解析 CLI Profile 参数

```typescript
const parsedProfile = parseCliProfileArgs(normalizedArgv);
if (parsedProfile.profile) {
  applyCliProfileEnv({ profile: parsedProfile.profile });
}
normalizedArgv = parsedProfile.argv;
```

CLI profile 允许用户通过 `--profile <name>` 切换不同的配置环境。

### 3.3 入口点判断 — Root Help 快路径

```typescript
if (shouldUseRootHelpFastPath(normalizedArgv)) {
  const { outputRootHelp } = await import("./program/root-help.js");
  outputRootHelp();
  return;
}
```

`shouldUseRootHelpFastPath` 判断是否是 `openclaw` 或 `openclaw --help`（无子命令），如果是就直接输出帮助文本，不走完整的 Commander 解析。

### 3.4 快路径路由尝试

```typescript
if (await tryRouteCli(normalizedArgv)) {
  return; // 快路径命中，直接返回
}
```

尝试快路径路由，如果命中则跳过 Commander 构建。如果不命中，继续构建完整的 Commander 程序。

### 3.5 构建程序并注册所有命令

```typescript
enableConsoleCapture();
const { buildProgram } = await import("./program.js");
const program = buildProgram();

installUnhandledRejectionHandler();

const parseArgv = rewriteUpdateFlagArgv(normalizedArgv);
const primary = getPrimaryCommand(parseArgv);

if (primary) {
  const ctx = getProgramContext(program);
  await registerCoreCliByName(program, ctx, primary, parseArgv);
  await registerSubCliByName(program, primary);
}

const hasBuiltinPrimary = primary !== null && program.commands.some((command) => command.name() === primary);
if (!shouldSkipPluginRegistration) {
  const config = await loadValidatedConfigForPluginRegistration();
  if (config) {
    registerPluginCliCommands(program, config);
  }
}

await program.parseAsync(parseArgv);
```

- `enableConsoleCapture()` — 捕获所有 console 输出到结构化日志
- `buildProgram()` — 创建 Commander 程序并注册所有命令
- `registerCoreCliByName` — 只注册当前命中的内置命令（懒加载的另一种形式）
- `registerPluginCliCommands` — 注入插件提供的 CLI 命令

---

## 4. Step 3: 快路径路由 (`route.ts`)

**文件:** `src/cli/route.ts`

快路径是 OpenClaw CLI 的性能优化核心。对于高频命令（如 `health`、`status`、`sessions`），完整构建 Commander 程序成本太高，快路径直接执行。

### 4.1 快路径判断条件

```typescript
export async function tryRouteCli(argv: string[]): Promise<boolean> {
  // 1. 环境变量可禁用快路径
  if (isTruthyEnvValue(process.env.OPENCLAW_DISABLE_ROUTE_FIRST)) {
    return false;
  }
  // 2. help/version 标志不走快路径（让 Commander 处理）
  if (hasHelpOrVersion(argv)) {
    return false;
  }

  // 3. 提取命令路径（前两个非选项 token）
  const path = getCommandPathWithRootOptions(argv, 2);
  if (!path[0]) {
    return false;
  }

  // 4. 在路由表中查找匹配
  const route = findRoutedCommand(path);
  if (!route) {
    return false;
  }

  // 5. 准备环境（加载配置/插件）
  await prepareRoutedCommand({ argv, commandPath: path, loadPlugins: route.loadPlugins });

  // 6. 执行命令
  return route.run(argv);
}
```

### 4.2 路由表 — `routes.ts`

**文件:** `src/cli/program/routes.ts`

```typescript
const routes: RouteSpec[] = [
  routeHealth,          // openclaw health
  routeStatus,          // openclaw status [--json|--deep]
  routeGatewayStatus,    // openclaw gateway status
  routeSessions,        // openclaw sessions
  routeAgentsList,      // openclaw agents list
  routeMemoryStatus,    // openclaw memory status
  routeConfigGet,       // openclaw config get <path>
  routeConfigUnset,     // openclaw config unset <path>
  routeModelsList,      // openclaw models list
  routeModelsStatus,    // openclaw models status
];

export function findRoutedCommand(path: string[]): RouteSpec | null {
  for (const route of routes) {
    if (route.match(path)) {
      return route;
    }
  }
  return null;
}
```

### 4.3 每个路由的执行方式

以 `routeStatus` 为例：

```typescript
const routeStatus: RouteSpec = {
  match: (path) => path[0] === "status",
  // --json 时可以跳过插件预加载，保持轻量
  loadPlugins: (argv) => !hasFlag(argv, "--json"),
  run: async (argv) => {
    const json = hasFlag(argv, "--json");
    const deep = hasFlag(argv, "--deep");
    const all = hasFlag(argv, "--all");
    // ... 更多参数解析 ...

    if (json) {
      const { statusJsonCommand } = await import("../../commands/status-json.js");
      await statusJsonCommand({ deep, all, usage, timeoutMs }, defaultRuntime);
      return true;
    }
    const { statusCommand } = await import("../../commands/status.js");
    await statusCommand({ json, deep, all, usage, timeoutMs, verbose }, defaultRuntime);
    return true;
  },
};
```

**关键设计：**

- `loadPlugins: (argv) => boolean` — 根据参数动态决定是否加载插件（如 `--json` 时不需要插件元数据）
- 动态 import — 命令代码在真正需要时才加载，进一步减少冷启动时间
- 返回 `boolean` — `true` 表示已处理，`false` 表示参数不完整应退回 Commander

### 4.4 快路径的局限

`openclaw status --deep` 这类带额外参数的命令，如果快路径无法处理（如缺少必需参数），会返回 `false`，回退到 Commander 完整解析。这确保了快路径不会破坏正常命令解析。

---

## 5. Step 4: 构建 Commander 程序 (`build-program.ts`)

**文件:** `src/cli/program/build-program.ts`

```typescript
export function buildProgram() {
  const program = new Command();
  const ctx = createProgramContext();
  const argv = process.argv;

  setProgramContext(program, ctx);     // Symbol-based 上下文共享
  configureProgramHelp(program, ctx);  // 定制帮助输出格式
  registerPreActionHooks(program, ctx.programVersion);  // 注册前置钩子

  registerProgramCommands(program, ctx, argv);  // 注册所有命令

  return program;
}
```

### 5.1 Symbol-Based 上下文共享

Commander 的 `Command` 实例在整个解析生命周期中传递，但需要在命令 action 函数中访问统一的上下文（如程序版本、通道选项）。OpenClaw 使用 Symbol 作为 key 将上下文附加到 `program` 对象上：

```typescript
const PROGRAM_CONTEXT_SYMBOL: unique symbol = Symbol.for("openclaw.cli.programContext");

export function setProgramContext(program: Command, ctx: ProgramContext): void {
  (program as Command & { [PROGRAM_CONTEXT_SYMBOL]?: ProgramContext })[PROGRAM_CONTEXT_SYMBOL] = ctx;
}

export function getProgramContext(program: Command): ProgramContext | undefined {
  return (program as Command & { [PROGRAM_CONTEXT_SYMBOL]?: ProgramContext })[
    PROGRAM_CONTEXT_SYMBOL
  ];
}
```

这种方式比全局变量更优雅，且不会污染 Commander 公开 API。

---

## 6. Step 5: 命令注册器与懒加载 (`command-registry.ts`)

**文件:** `src/cli/program/command-registry.ts`

### 6.1 命令条目数组

内置命令按分组组织成 `coreEntries` 数组，每个 entry 包含多个 command descriptor 和一个 `register` 函数：

```typescript
const coreEntries: CoreCliEntry[] = [
  {
    commands: [{ name: "setup", description: "Initialize local config and agent workspace", hasSubcommands: false }],
    register: async ({ program }) => {
      const mod = await import("./register.setup.js");
      mod.registerSetupCommand(program);
    },
  },
  {
    commands: [{ name: "message", description: "Send, read, and manage messages", hasSubcommands: true }],
    register: async ({ program, ctx }) => {
      const mod = await import("./register.message.js");
      mod.registerMessageCommands(program, ctx);
    },
  },
  // ... agent, status, config, memory, etc.
];
```

### 6.2 懒加载原理 — 占位符命令

注册时，每个命令不是立即加载真实实现，而是先注册一个**占位符命令**：

```typescript
function registerLazyCoreCommand(
  program: Command,
  ctx: ProgramContext,
  entry: CoreCliEntry,
  command: CoreCliCommandDescriptor,
) {
  // 1. 创建占位符命令
  const placeholder = program.command(command.name).description(command.description);
  placeholder.allowUnknownOption(true);  // 接受任意选项（因为真实命令可能有）
  placeholder.allowExcessArguments(true);

  // 2. 占位符 action：触发真正的懒加载
  placeholder.action(async (...actionArgs) => {
    // 移除占位符和同组的其他占位符
    removeEntryCommands(program, entry);

    // 动态导入真实实现并注册
    await entry.register({ program, ctx, argv: process.argv });

    // 重新解析当前 argv（此时占位符已被替换为真实命令）
    await reparseProgramFromActionArgs(program, actionArgs);
  });
}
```

### 6.3 懒加载触发的时机

```
用户输入: openclaw message send --target xxx
                    │
                    ▼
 Commander 解析到 "message" 子命令
                    │
                    ▼
 触发占位符 action (...actionArgs)
                    │
                    ▼
 removeEntryCommands() — 移除 message 占位符
                    │
                    ▼
 await import("./register.message.js") — 动态加载
                    │
                    ▼
 mod.registerMessageCommands(program, ctx) — 注册 send/read/poll 等子命令
                    │
                    ▼
 reparseProgramFromActionArgs() — 用真实命令重新解析
                    │
                    ▼
 命中真实的 send 子命令 → 执行 sendAction
```

**为什么要重新解析？**

因为 Commander 的解析是不可逆的——当占位符 action 被触发时，`parseAsync` 已经在解析流程中途，不能直接跳到子命令。`reparseProgramFromActionArgs` 用当前已解析的参数重新驱动 Commander，找到新注册的真实子命令并执行。

### 6.4 单命令注册优化

如果用户输入了 primary 命令（如 `openclaw message`），则只注册该命令对应的 entry，而不是注册所有命令：

```typescript
export function registerCoreCliCommands(program: Command, ctx: ProgramContext, argv: string[]) {
  const primary = getPrimaryCommand(argv);
  if (primary && shouldRegisterCorePrimaryOnly(argv)) {
    const entry = coreEntries.find((candidate) =>
      candidate.commands.some((cmd) => cmd.name === primary),
    );
    if (entry) {
      const cmd = entry.commands.find((c) => c.name === primary);
      if (cmd) {
        registerLazyCoreCommand(program, ctx, entry, cmd);
        return;
      }
    }
  }

  // 未识别的主命令或 help/version：注册所有（用于帮助输出）
  for (const entry of coreEntries) {
    for (const cmd of entry.commands) {
      registerLazyCoreCommand(program, ctx, entry, cmd);
    }
  }
}
```

---

## 7. Step 6: Pre-Action 钩子与上下文注入

**文件:** `src/cli/program/preaction.ts`

Commander 的 `program.hook("preAction")` 在每个命令 action 执行前触发。这是 CLI 启动流程的最后一步，在真正的业务逻辑之前完成环境准备。

### 7.1 Pre-Action 钩子注册

```typescript
export function registerPreActionHooks(program: Command, programVersion: string) {
  program.hook("preAction", async (_thisCommand, actionCommand) => {
    // 1. 设置进程标题
    setProcessTitleForCommand(actionCommand);

    // 2. 输出 Banner（除非环境变量隐藏）
    if (!hideBanner) {
      emitCliBanner(programVersion);
    }

    // 3. 设置 verbose 模式
    const verbose = getVerboseFlag(argv, { includeDebug: true });
    setVerbose(verbose);

    // 4. 加载配置文件
    if (!shouldBypassConfigGuard(commandPath)) {
      await ensureConfigReady({ runtime: defaultRuntime, commandPath, ... });
    }

    // 5. 加载插件（按需）
    if (shouldLoadPluginsForCommand(commandPath, argv)) {
      ensurePluginRegistryLoaded({ scope: resolvePluginRegistryScope(commandPath) });
    }
  });
}
```

### 7.2 命令路径解析

```typescript
const commandPath = getCommandPathWithRootOptions(argv, 2);
// 例如: ["message", "send"], ["status", undefined], ["config", "get"]
```

### 7.3 按需加载插件

```typescript
const PLUGIN_REQUIRED_COMMANDS = new Set([
  "message", "channels", "directory", "agents", "configure", "status", "health",
]);

function shouldLoadPluginsForCommand(commandPath: string[], argv: string[]): boolean {
  const [primary, secondary] = commandPath;
  if (!primary || !PLUGIN_REQUIRED_COMMANDS.has(primary)) {
    return false;
  }
  // status --json 和 health --json 不需要插件
  if ((primary === "status" || primary === "health") && hasFlag(argv, "--json")) {
    return false;
  }
  // onboard 和 channels add 是 manifest-first，按需加载
  if (primary === "onboard" || (primary === "channels" && secondary === "add")) {
    return false;
  }
  return true;
}
```

### 7.4 配置守护绕过

```typescript
const CONFIG_GUARD_BYPASS_COMMANDS = new Set(["backup", "doctor", "completion", "secrets"]);
```

这些命令不需要完整的配置就绪检查，可以直接运行。

---

## 8. Step 7: 执行目标命令

以 `openclaw message send` 为例，执行链路为：

### 8.1 命令注册

`register.message.ts` 注册 `message` 命令及其所有子命令：

```typescript
export function registerMessageCommands(program: Command, ctx: ProgramContext) {
  const message = program.command("message")
    .description("Send, read, and manage messages and channel actions")
    .action(() => { message.help({ error: true }); }); // 无参数时显示帮助

  const helpers = createMessageCliHelpers(message, ctx.messageChannelOptions);
  registerMessageSendCommand(message, helpers);     // send 子命令
  registerMessageBroadcastCommand(message, helpers);
  registerMessagePollCommand(message, helpers);
  registerMessageReadEditDeleteCommands(message, helpers);  // read/edit/delete
  // ... emoji, sticker, thread, etc.
}
```

### 8.2 Send 命令执行

`register.send.ts` → `commands/message.ts` → `message-action-runner.ts` → `outbound-send-service.ts` → `deliver.ts`

这条链路在 Module 02（消息发送链路）中有详细分析，此处不再赘述。

---

## 设计亮点总结

### 1. Respawn Guard — 干净的启动环境

通过重 spawn 子进程传递 `--disable-warning=ExperimentalWarning`，解决了 Node.js 实验性功能警告污染输出问题。父进程通过 `process.exit(code)` 透传子进程退出码，保持语义一致。

### 2. 快路径路由 — 高频命令零 overhead

`health`、`status`、`sessions`、`config get` 等高频命令跳过完整的 Commander 构建和解析，直接执行。动态 import 进一步减少冷启动时间。

### 3. 懒加载命令注册 — 按需加载真实实现

占位符命令只在真正被执行时才触发真实模块的加载和重新解析。这种模式让 CLI 的启动时间不随命令数量增长，适合大量命令的场景。

### 4. Symbol-Based 上下文共享

`ProgramContext` 通过 Symbol 附加到 Commander `program` 对象上，既实现了全局共享，又不污染公开 API。

### 5. Pre-Action 钩子统一环境准备

所有命令执行前都通过同一个 preAction 钩子完成 banner 输出、verbose 设置、配置加载、插件加载，避免在每个命令中重复这堆逻辑。

### 6. 多重跳过条件 — 不会过度执行

每个阶段都有多重跳过条件：
- `OPENCLAW_DISABLE_ROUTE_FIRST` 环境变量禁用快路径
- help/version 参数跳过 respawn 和快路径
- `--json` 参数跳过插件预加载
- manifest-first 命令（onboard、channels add）延迟插件加载

### 7. 递归保护 — respawn 不会陷入无限循环

通过 `OPENCLAW_NODE_OPTIONS_READY` 环境变量标记，确保重 spawn 只发生一次，子进程不会再次 respawn。