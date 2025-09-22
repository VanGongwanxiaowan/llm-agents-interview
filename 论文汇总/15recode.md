「 LLM Code, Code Migration, RL 」

ReCode: Updating Code API Knowledge with Reinforcement Learning

ReCode，使 LLM 能够通过少量数据快速学习并更新过时的 API 知识，学会 “跨版本代码迁移”。

当 API 更新，LLM 掌握的api知识会即时过时，导致生成的代码在新版本环境中频繁报错。

作者提出 ReCode， target “跨版本代码迁移”任务，让模型学会 “读更新说明 -> 改代码”， 即：

给定：旧代码 + API 更新说明（release notes）
产出：使用新 API 的代码

训练时对每一步生成给予额外的 迁移正确性（EM/ES + 语法校验）。这会显著提高新 API token 权重。

https://www.arxiv.org/abs/2506.20495

在 LLM 训练的语境中，有一种现象叫 grokking。

模型在训练早期就完全记住训练集，却在很长一段时间里，测试准确率低；但再持续优化，测试准确率突然飙升，显示出 “迟到的泛化”。

Grokking，不是瞬间gotcha，而是一个过程，如同 “顿悟”，往往意为着 “求索 -> 不得 -> 顿悟”。

LLM 随时响应着我们的回答，似乎每秒都是gotcha瞬间，但 grokking 时刻，可能只会被更少的人拥有。

Grokking：类似于 grokking 的现象在 30–40 年前的数值计算中就已有深入研究。那时，它被称为“残差值向收敛点传播”（residual value propagation toward the convergence point），有时也被称为“巩固”（consolidation）。然而，在深度学习和大语言模型中，我们并没有真正意义上的收敛点或不动点

















