https://x.com/imjaredz/status/1973035370041532685


逆向 OpenAI Codex 后发现它和 Claude Code 设计理念确实不同，作者 

@imjaredz

 提炼了 Codex 的设计：“Unix 哲学” —— 简单、专注，利用现有 shell 工具而非复杂抽象！

C
odex 核心架构：单一 ReAct 循环

OpenAI Codex 采用单一智能体的 ReAct 风格循环（Think → Tool Call → Observe → Repeat），由 AgentLoop. run() 函数驱动。该循环从用户提示（如“重构 utils.ts 使用箭头函数”）开始，构建对话上下文（包括详细系统提示），通过 OpenAI 的 Responses API（支持流式响应和工具调用）发送请求给 GPT-5 系列模型。CLI 执行工具调用（如 shell 命令），将结果反馈回模型，直至模型输出最终答案而不需更多工具。


这一设计是单线程的，保持平坦的消息历史，便于调试和执行路径清晰。与 Claude Code 类似，它避免多智能体并发，确保单一“意识线程”逐步积累上下文。

关键哲学与实现细节

突出 Codex 的四大设计理念，体现了“杠杆现有知识而非重造轮子”的智慧：

· Shell-First 哲学：核心工具仅一个通用 shell 执行器，利用 bash 等熟悉命令（如 cat 读文件、grep 搜索、ls 列目录、git 操作）。这减少了学习新 API 的负担，模型直接“说 shell 语言”。编辑文件时，使用特殊 apply_patch 命令生成统一 diff 格式（红删绿加的可视化），CLI 拦截并显示变更，用户可批准、拒绝或编辑。相比全文件重写，diff 更节省上下文，降低错误率。

· Diffs 保存上下文：生成最小化补丁，避免长代码生成易出错的问题。提示中嵌入 diff 格式示例，确保模型输出标准化。

· OS 级沙箱隔离：强调真实内核级安全，而非应用权限。macOS 用 Apple Seatbelt 配置文件，Linux 用 Docker + iptables 限制文件系统和网络访问。默认无互联网，危险操作需用户批准（如“Suggest”模式下读操作自动通过）。

· 隐式规划：无冗长任务列表或“让我想想”独白。提示引导模型迭代式行动（读 → 编辑 → 测试），像与“先码后解释”的开发者配对。系统提示（部分泄露）教导工具调用格式、输出规范，并内置安全假设（如沙箱默认）。

这些细节源于泄露提示，例如工具调用格式：
```
{
  "cmd": ["apply_patch", "*** Begin Patch\n*** Update File: path/to/file…*** End Patch"]
}
```
整体上，Codex 偏好 bash，重命令行，避免花哨工具抽象。

与 Claude Code 的比较

Codex 和 Claude Code 都以 diff 为中心，但 Codex 更简约、灵活，而 Claude 更结构化：

· 工具设计

Codex: 单一 shell 接口，灵活但可能较慢，利用现有 CLI 工具（如 cat/grep）

Claude Code: 专用工具集（如 View/LS、GrepTool、Edit/Write、Bash、WebFetch），边界清晰，支持批量多文件操作。

· 规划方式

Codex: 隐式迭代，无显式 TODO 或 `/think` 模式，行为更“人性化”。

Claude Code: 显式规划（如 TodoWrite 工具），可能冗长但易追踪。 


· 偏好与功能

Codex: 无默认互联网（沙箱阻挡），支持多模态输入（如图像）；重本地操作。

Claude Code: 包含 WebFetch（受控网络），无图像支持；验证更强。 

· 复杂性

Codex: 简简单单循环，易调试；少工具=少出错。 

Claude Code: 工具多，适合复杂任务，但需学习 API。 |


Codex 胜在简洁和 shell 杠杆，Claude 胜在工具精确性和规划透明，Codex 证明：无需 50 个专用工具，一个懂 shell 的模型足矣。

总体 takeaway

Codex CLI 展示了 AI 智能体开发的“Unix 之道”——专注单一职责、复用生态、迭代而非大计划。这不仅提升效率，还增强安全与用户体验。建议开发者从中学习：优先利用模型现有知识（如 shell），用 diff 管理上下文，OS 级隔离防风险。相比 Claude Code，Codex 更像“终端原住民”，适合快速本地任务，但 Claude Code 的结构工具在多文件/网络场景更优。



<img width="1200" height="1105" alt="image" src="https://github.com/user-attachments/assets/6b11c4f2-e904-4eea-b18b-ad6e19865d22" />

