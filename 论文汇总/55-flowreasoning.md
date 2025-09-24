「Multi-Agent, Reasoning」论文

FlowReasoner: Reinforcing Query-Level Meta-Agents

轻云顺风即变，FlowReasoner 使 multi-agent workflow 随query应变于瞬息之间。

这篇论文十分精彩，作者瞄准“one system per user query”的目标：为每一条用户 query 即时推理出一个专属的multi-agent 工作流（one workflow per query）。

首先什么是 workflow ？
在 Code Interpreter 场景下，不同 agent 各司其职，例如：

Code Generator：生成候选代码
Ensemble：整合多路候选
Review：静态审查
Revise：依据反馈重写
Code Test：执行单元测试并返回结果

在工程实践中，我们会排列组合上述agent任务，形成工作流workflow，如以下几种：

Generate → Test ： G → T
Generate → Test ↻ Revise ： G → T → (Revise → T)…
Generate → Review → Revise： G → Review → Revise
Ensemble： G₁,G₂,G₃ → Ensemble

不同的workflow使用于不同的task，例如G → T适合最简单的边界清晰的函数级算法题，而Generate → Test ↻ Revise适合容易漏掉边界条件或有隐藏 corner case 的任务。

传统 multi‑agent workflow 往往是task‑specific的，需要工程师手动搭建，很难跟随用户的 query 实时调整。FlowReasoner 通过 推理 SFT + GRPO 强化学习，让模型学会根据执行反馈动态改写 workflow：

Reasoning SFT：用 DeepSeek‑R1‑671B 生成的 1 400 条“推理‑工作流”示例微调 Distill‑Qwen‑7B/14B。
GRPO RL：在真实执行环境中，用 Pass@1、AST 复杂度、Distinctness 等多目标奖励逐轮优化推理链。

值得注意的是，FlowReasoner仅适用“code‑Interpreter”场景，因为它们依赖 Python 执行和单元测试。

也就是说，workflow泛化了，但仅在定义的具体场景中泛化。跨场景迁移时，必须重选/新建agent 任务，并为每个agent绑定相应的外部工具与奖励信号。

但依然非常一颗赛艇！

FlowReasoner 的方法，其实可以把multi-agent workflow泛化迁移到检索、数据分析、多模态等更广阔的领域。


https://arxiv.org/abs/2504.15257

动态workflow适用于探索式场景
对于一项极其明确的任务 如果早已获得较好的输出时 完全没必要跑这种模式

这种模式相比固定workflow可能存在大量幻觉 而导致无法稳定输出获得可控结果

这就像一个新员工入职 你明可以提供他固定的sop 他就能做到80分
那就没有任何必要让他去自我探索
探索时往往带来不可控风险

所以动态最好的场景是没有回收任何经验时，这事儿人可能都没太多经验数据，做动态会更容易快速到达一个还不错的可用性，在基于此做一些rag和rule based就能做的更好

https://arxiv.org/abs/2504.15257
