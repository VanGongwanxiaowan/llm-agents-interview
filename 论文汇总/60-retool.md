「Agent, Reasoning」论文

ReTool: Reinforcement Learning for Strategic Tool Use in LLMs

相比于ReAct 的干中学，ReTool 是学中干。

ReTool 是 ReAct 的进阶，将多轮 tool calling 的策略从模型外部显性的 prompt，内化为模型参数，通过强化学习实现策略优化。

具体的，ReTool 提出了一种 Post-training 与工具使用（如 code interpreter）相结合的方法，让 Large Reasoning Model 的 reasoning 能力应用于 multi-turn 的工具使用上。

训练方法跟一般的 post-training 一样，分两步：
第一步，所谓的 cold start，构建高质量 tool calling 数据，做 SFT；
第二步，通过 RL，继续调整 LLM 的参数，使它优化调用 tool 的策略（when and how）。

特别的，ReTool 提出了 Rollout with Interleaved Code Execution 步骤：

Reasoning，
<code> ... </code>，
<interpreter>Traceback ... </interpreter>

循环交替，构成一个交错流程（interleaved rollout），最终实现多轮 multi-turn 的外部工具使用。

这个过程非常像 ReAct 的 observation–Reasoning–Action 的多轮 tool call。

只不过，ReAct 完全通过 prompt engineering 和 few-shot 来实现，不改变模型的参数。

而 ReTool 利用 Post-training，特别是 RL 来改变了 policy，而在 LLM 的语境中，policy 就是 LLM 本身。

ReTool 改变了模型的权重，将多轮 tool call 的策略内化进了模型，在这个意义上，ReAct 更像是干中学，而 ReTool 则是学中干。

最后，其实非常好奇ReTool的latency，可惜作者没有提供相关实验。test time scaling agent 如果非常慢，什么场景最合适呢？

<img width="1200" height="736" alt="image" src="https://github.com/user-attachments/assets/b2eb4ed6-7fa3-4637-b2a9-bccb5209e067" />

paper:
https://arxiv.org/abs/2504.11536

