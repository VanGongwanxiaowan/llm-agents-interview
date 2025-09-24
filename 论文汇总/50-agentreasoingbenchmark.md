「Agent, Reasoning, Benchmark」论文：

τ -bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains

在 LLM Agent 时代，我们应如何评估 Agent 的整体表现？

一篇精彩的 benchmark 论文，来自Shunyu Yao。该Benchmark 通过在零售与航空两个customer service场景下，构造long context对话，重点考察Agent能否同时完成三项任务：

- 理解用户 intents
- 遵循domain-specific policy（如退货／改签规则）
- 正确调用API，与后端数据库交互

过去我的认知里，“满足用户诉求” 似乎是Agent的首要目标。

但 τ-bench 的第二点提醒我们：在真实业务中，Agent 必须首先合规, 只在policy允许的范围内满足用户请求；若规则不允许，则需要拒绝并给出替代方案。

这种 “用户 intent + domain-specific policy” 的双重约束，才是生产系统里真正棘手的问题。

论文的另一个亮点是对用户画像的设计。图 2 (b) 中的示例将用户设定为：

“You are in debt and sad today, but very brief.”

这不仅体现了用户的 社会、经济与心理状态，也隐含的影响其沟通方式和intent强度。

现实中用户千差万别，Agent 必须在遵守规则的同时展现同理心并动态调整策略。非常好奇Agent对这个用户画像维度的反应。

期待基于 τ-bench 展开更多 Agent 架构与训练方法的探索！

Paper: https://arxiv.org/abs/2406.12045
