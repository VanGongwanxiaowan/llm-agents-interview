「LLM, Reasoning」论文
Teaching Large Language Models to Reason through Learning and Forgetting

“红雨瓢泼泛起了回忆怎么潜” 😅。
LLM 也会在post-training过程中的错误模式中反复重演旧习，而 Unlikelihood Loss 让它学会遗忘，而非沉溺。

这是一篇非常有趣的论文，旨在提升 LLM 的 reasoning 能力，同时降低由于 test-time scaling 带来的高latency问题。

从方法上，首先，作者通过多种方法（如 Tree-of-Thought、BFS）中收集成功与失败的推理路径，用于 SFT 微调。

传统的 SFT 微调方法只会采用成功的蒸馏推理数据。而此论文同时利用成功和失败路径，将 SFT 分为两部分：

学习（Learning）：对成功路径进行监督学习微调，增强模型正确推理的能力。

遗忘（Forgetting）：对失败路径施加不相似性损失（Unlikelihood Loss），从而抑制模型重复错误推理的倾向。

其中 Forgetting 的作用，在于用 Unlikelihood Loss 惩罚语法正确但推理逻辑错误的路径（一本正经胡说八道），告诉 LLM 以后遇到这种情况不要再说了，进行 token 级别的惩罚。

此处多说两句 Maximum Log Likelihood (MLE) 和 Unlikelihood Loss (UL)。

两者都是 token 级别的 loss 函数，调整生成的 token 分布：用 MLE 来学习高质量样本；用 UL 来洗掉模型中已有的、或新学到的坏模式。

实际上 UL 在实际中用处很多，比如帮助模型避免常见的语言毛病，或者用于敏感词过滤😅。

UL 让我对目前 post-training 的 RL 有了更多的思考。目前的 RL 虽然可以对错误推理路径打低分，但 RL 天然偏 reward 奖励，而 UL 虽然粗暴，似乎更直接。

<img width="1200" height="444" alt="image" src="https://github.com/user-attachments/assets/04a2cd6b-f2de-48c8-bb78-a7703004e60a" />


arxiv.org/abs/2504.11364
