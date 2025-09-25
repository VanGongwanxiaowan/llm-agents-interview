「LLM x RL」DeepSeek 最新论文：Inference-Time Scaling for Generalist Reward Modeling

在 RL 中，Reward Modeling（RM）是一个非常重要的部分。RM 主要用于对 LLM 的生成结果进行打分，从而调整 LLM 的 policy，使其更符合 RM 设定的要求，比如更强的 reasoning 能力。

针对特定任务（Task-specific）的 RM 相对容易设计，能够对 LLM 在具体任务中的生成结果进行较为准确的评分。
但一个通用的 Reward Model（General RM，简称 GRM），需要对不同类型的任务都给出准确评分，这非常困难。

GRM 的难点在于它需要学习一个潜在的规则（latent rule），以判断在不同任务中应该如何评分。
然而 latent rule 难以学习，DeepSeek 干脆采用了显式的、基于规则（rule-based）的方法——所谓的 Self-Principled Critique Tuning（SPCT），通过生成不同的 principle 和 critique 来辅助 GRM 的评分。

非常聪明！但看到 rule-based，又仿佛回到了 machine learning 最初的模样：rule-based、feature engineering……


<img width="1200" height="758" alt="image" src="https://github.com/user-attachments/assets/a5d4e360-779d-47cd-944b-c044b4757d35" />

https://arxiv.org/abs/2504.02495
