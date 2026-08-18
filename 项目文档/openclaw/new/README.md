# Mini OpenClaw - 精简版学习项目

## 概述

Mini OpenClaw 是 OpenClaw 的精简版本，专门用于学习其核心架构和设计决策。

**与原版的区别**：
- 保留了核心架构（Gateway、Agent、Channel、Plugin）
- 去除了复杂的边界情况处理
- 简化了代码，便于理解
- 包含详细的注释解释设计决策

---

## 文件结构

```
new/
├── README.md                    # 本文档
└── src/
    ├── mini-openclaw.ts         # 核心框架（主要学习内容）
    └── index.ts                 # 入口文件和 CLI

mini-openclaw.ts 结构：
├── 第一部分：类型定义           # Message, Session, Agent, Tool 等
├── 第二部分：Provider           # LLMProvider 抽象
├── 第三部分：Plugin             # 插件系统
├── 第四部分：Hook               # 生命周期 Hook 机制
├── 第五部分：Agent              # AI 对话处理核心
├── 第六部分：Channel            # 消息渠道接入
├── 第七部分：Gateway             # 核心路由
├── 第八部分：工具实现            # bash, read 等内置工具
├── 第九部分：Provider 实现       # MockProvider 示例
└── 第十部分：主程序              # main 函数
```

---

## 核心概念

### 1. Gateway（网关）

Gateway 是整个系统的核心，负责：
- 管理 Agent 和 Channel 的生命周期
- 协调消息的流向
- 提供控制面板接口

**消息流向**：
```
User -> Channel -> Gateway -> Agent -> LLM -> (Tool) -> Agent -> Gateway -> Channel -> User
```

**为什么 Gateway 是单进程**：
- 延迟最低（进程内通信）
- 简单（不需要考虑分布式）
- 对于个人使用来说足够

### 2. Agent（智能体）

Agent 是 AI 对话的处理单元：
- 维护会话上下文（Session）
- 调用 LLM 生成回复
- 处理工具调用循环
- 管理消息历史

**工具调用循环**：
```
Agent 调用 LLM
    ↓
LLM 返回工具调用（如 bash ls）
    ↓
Agent 执行工具
    ↓
工具结果加入消息历史
    ↓
再次调用 LLM（带工具结果）
    ↓
直到 LLM 返回普通回复
```

### 3. Channel（渠道）

Channel 是消息来源的接入点：
- 统一不同渠道的消息格式
- 支持 Telegram、Discord、WhatsApp 等
- 负责消息的接收和发送

**为什么需要 Channel 抽象**：
- 不同渠道的 API 不同
- 统一后上层代码不需要感知差异
- 便于扩展新的渠道

### 4. Plugin（插件）

Plugin 是扩展机制：
- 可以添加新工具
- 可以添加新渠道
- 可以注册 Hook 干预消息处理
- 可以添加新 Provider

**插件清单（Manifest）**：
- 在加载代码前读取
- 用于验证配置
- 声明插件的能力

### 5. Hook（钩子）

Hook 允许在消息处理流程中干预：
- `before_agent_start` - Agent 启动前
- `before_prompt_build` - 构建提示词前
- `llm_input` - LLM 输入前
- `llm_output` - LLM 输出后
- `before_tool_call` - 工具调用前
- `after_tool_call` - 工具调用后
- `before_agent_reply` - Agent 回复前

**Hook 执行顺序**：
- 按 priority 从低到高执行
- 如果返回 blocked，停止执行
- 可以修改事件数据

### 6. Tool（工具）

Tool 是 Agent 可以调用的外部能力：
- 内置工具：bash, read, write, glob 等
- Plugin 工具：由 Plugin 提供
- MCP 工具：通过 MCP 协议暴露

---

## 设计决策详解

### 决策 1：为什么用 TypeScript？

**原因**：
- 类型安全，减少运行时错误
- IDE 支持好，代码提示准确
- 便于重构和维护

**不这样做的后果**：
- 运行时类型错误难以发现
- 重构时容易引入 bug
- 代码提示不准确

### 决策 2：为什么需要统一消息格式？

**原因**：
- 不同渠道消息格式不同
- 统一后上层代码不需要处理差异
- 便于测试和扩展

**不这样做的后果**：
- Gateway 代码中散布着渠道特殊处理
- 新增渠道需要改很多地方
- 测试时无法统一 mock

### 决策 3：为什么需要 Hook？

**原因**：
- 修改行为不改变核心代码
- 可以动态添加/移除功能
- 便于日志、监控、分析

**不这样做的后果**：
- 想改行为只能改核心代码
- 升级时手动合并修改
- 无法动态调整

### 决策 4：为什么需要工具循环检测？

**原因**：
- 防止 Agent 陷入死循环
- AI 可能反复调用同一工具
- 需要强制终止

**不这样做的后果**：
- Agent 可能卡住
- 浪费资源
- 用户体验差

### 决策 5：为什么 Provider 要抽象？

**原因**：
- 支持多个 AI 模型
- 今天 Claude，明天 GPT
- 只需要改配置

**不这样做的后果**：
- 代码散布 Provider API 调用
- 换模型需要改很多地方
- 测试时无法 mock

---

## 工程细节

### 1. 为什么用 ES Module？

- 原生模块支持，不需要额外工具
- `import.meta.url` 可以获取文件路径
- Tree shaking 优化更好

### 2. 为什么用 async/await？

- 比 Promise.then 更清晰
- 错误处理更简单
- 避免回调地狱

### 3. 为什么用 Map 存储？

- 比 Object 更灵活
- 可以用对象作为 key
- 有更好的类型安全

### 4. 为什么需要超时控制？

- 命令可能执行很久
- 防止资源泄露
- 提高用户体验

---

## 如何运行

```bash
# 使用 tsx（推荐）
npx tsx src/index.ts

# 或直接运行 ts 文件
npx tsx src/mini-openclaw.ts

# 使用 bun
bun run src/index.ts
```

---

## 如何学习

### 学习路径

1. **先读 README.md**（本文档）- 了解整体架构
2. **读 mini-openclaw.ts** - 理解核心实现
3. **读 index.ts** - 理解启动流程
4. **对照原版代码** - 找出差异

### 学习重点

1. **类型定义** - 理解数据结构
2. **接口设计** - 理解模块边界
3. **设计决策** - 理解为什么这样做
4. **工程细节** - 理解如何实现

### 对比原版

差异文件对照：
| Mini 版本 | 原版位置 | 说明 |
|-----------|----------|------|
| mini-openclaw.ts | src/gateway/, src/agents/ | 核心实现 |
| index.ts | src/entry.ts, src/cli/run-main.ts | 启动流程 |
| 工具定义 | src/agents/tools/ | 工具系统 |
| Hook 定义 | src/plugins/hooks.ts | Hook 机制 |
| Channel 定义 | src/channels/ | 渠道抽象 |

---

## 总结

Mini OpenClaw 展示了 OpenClaw 的核心架构：

- **分层清晰**：Gateway / Agent / Channel / Plugin 职责分明
- **接口驱动**：通过接口定义模块边界
- **扩展性强**：通过 Plugin 和 Hook 支持扩展
- **配置驱动**：通过配置而非代码控制行为

理解这些核心概念后，再去看原版代码会容易很多。