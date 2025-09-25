「LLM, Reasoning」论文
Distilling System 2 into System 1 

“不怕念起，只怕觉迟。” —— 禅宗语

这是一篇发表于去年的论文。它没有炫目的 benchmark，但字里行间却充满了心理学与哲学的意味。我非常喜欢。

最近被一波又一波的 Reinforcement Learning搞得有些疲惫。恰好利用这篇论文，回到System 1 和 System 2 的理论，从心理学与禅意的角度，审视语言模型中的 inference-time scaling。

人类的推理大致分为两个系统：

System 2 是深思熟虑、理性克制的推理方式。它缓慢、费力，却更稳妥、更具结构性，是我们在做复杂决策、逻辑推演时所依赖的“觉照之心”。

System 1 则是快速、直觉、自动的应对方式。它反应迅捷、无需思考，是我们日常行为、即时判断背后的“第一念”。

认知心理学告诉我们：人类的智慧往往起于 System 2，却归于 System 1。开车初学者谨慎依图（System 2），久而久之便能人车合一（System 1）；学者初解公案步步审思，久修之后念起即觉。

在大语言模型中：System 2 的模拟与成本
Inference-time scaling，即模型在生成答案时采用多步推理方式，而非一次性前向传播完成。这包括：

Chain-of-Thought（链式思维）
ReAct、Tree-of-Thoughts 等结构化推理机制
如 DeepSeek R1、OpenAI o1 等模型中的反思式生成策略

这些方法试图模拟人类的 System 2：更慢、更重计算，但推理能力更强、答案更可控。它们使模型具备了“觉照”的特质，能一步步探究问题、构建路径、反思错误。
但也因此，它们变得笨重、昂贵，失去了 System 1 式的轻盈与即应。

偏向 System 2 的时代，我们是否走远了？

当几乎所有的技术努力都集中在 System 2 的建构时，尤其在强化学习（RL）大行其道之后，AI 开始越来越“Artificial”，却不一定更“Intelligent”。

就像禅门所言：“不怕念起，只怕觉迟。” —— 念头生起本非问题，问题在于是否能即刻觉察、自然化解。

而真正的智慧，是将 System 2 的觉知内化为 System 1 的自然反应。

System 2 -> System 1
正如这篇论文所提倡的：我们不应一味向后堆叠 inference-time 思维链条，而应该思考如何将 System 2 的推理能力蒸馏进 System 1 的即时反应中。

这不仅是一种技术优化，也是一种认知回归 ——
 从post-training 走向pretraining，从刻意的理性转向自然的智慧。

 <img width="1108" height="1102" alt="image" src="https://github.com/user-attachments/assets/614d2d42-8ee9-4acf-8cde-94e21bdd6206" />


https://arxiv.org/abs/2407.06023
