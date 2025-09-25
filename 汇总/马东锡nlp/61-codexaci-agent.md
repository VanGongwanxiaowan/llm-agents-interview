「codex, ACI, Agent」论文

SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering

从 Human‑Computer Interaction (HCI) 到 Agent‑Computer Interaction (ACI) —— AI IDE 的基石与框架

今天 OpenAI 开源了 Codex CLI。这正是 NeurIPS 2024 论文 SWE‑agent 中提出的精彩概念 Agent‑Computer Interface（ACI） 的一次产品级实践。

SWE‑agent = ReAct + CLI 原生 = ACI

1. ReAct：Thought → Action → Observation
在运行 Codex CLI 时，你会清晰看到经典的 ReAct 循环：
这一流程与 SWE‑agent 在论文中描述完全一致：

“At each step, SWE‑agent generates a thought and a command, then incorporates the feedback from the command’s execution in the environment (ReAct).”

2. CLI 原生：让 Linux CLI 成为Agent的工具
Codex CLI 构建在 Linux shell 之上，必要时会直接调CLI（如 sed, grep, pytest）完成代码检查与测试，对应论文中的另一句：

“Built atop the Linux shell, SWE‑agent also allows access to common Linux commands and utilities when needed.”

3. 从思想上，SWE-agent提出了精彩的新概念，ACI。

LLM在编程场景中就像“新型用户”，需要专门为其量身定制的人机交互层——ACI。与HCI的不同之处在于：

HCI 面向人类直觉，ACI 面向Agent推理；
HCI用GUI追求“让人觉得好用”，ACI追求“让Agent更容易reasoning、有更简洁精确的context, 指令和工具”。

ACI的特点是：

精简指令集合 把嘈杂的Linux CLI抽象成少量高杠杆动作，降低回合数与成本。
反馈充分且简洁 固定格式 + 必要元数据，避免上下文膨胀。
内置护栏 语法 lint、无效编辑回滚，阻断错误连锁。

值得一提的是，codex是纯CLI系统，是ACI的纯粹实践。
其他如cursor，Windsurf或者是devin，是HCI和ACI的结合。

但只从agent的角度来说，理解ACI才能更加当我们vibe coding的时候，到底是怎么回事。

<img width="713" height="726" alt="image" src="https://github.com/user-attachments/assets/a4405bc7-2396-4dfd-b077-91e1edfc7b67" />

paper: 

https://arxiv.org/abs/2405.15793

