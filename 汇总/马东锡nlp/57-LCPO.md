「LLM, Reasoning」论文
L1: Controlling How Long A Reasoning Model Thinks With Reinforcement Learning

智慧不在于一味求索，而在于懂得根据问题的复杂性，伸缩思考的深度。

这篇论文非常出色，在test-time scaling的潮流中，直面了它的主要问题：即模型在推理过程中过于缓慢、冗长。

Test-time scaling的问题源于其自身特点——刻意增加LLM的推理长度，可以提升模型解决复杂问题的能力。

由于强化学习（RL）对scaling的鼓励，所谓的“aha moment”让模型倾向于过度地展示其思维过程：“一方面，另一方面，aha，wait，what if...”。模型似乎时刻用超高的latency考验用户的耐心。

这篇论文提出了LCPO（Length Controlled Policy Optimization，长度可控策略优化）的方法。

作者同样使用RL对模型进行优化，其核心是设计一个平衡准确性和长度遵循性的奖励函数，旨在训练语言模型在保持推理准确性的同时，尽量满足提示中对长度的要求。

论文最大的亮点： 模型能够根据提示中给出的要求，自适应地控制推理长度，从而有效节约计算资源。

两点思考：

Test-time scaling的方法特别适用于复杂的数学问题。但普通用户在使用这些模型时，有多少场景是在解决复杂的数学问题？大型模型公司完全可以借鉴这一方法，根据用户的query自动决定模型推理的合适长度。

强化学习带有一种强烈的rule-based（基于规则）的特点。这种特性会放大贴合规则的效果，但也容易忽略规则之外的因素。规则即是限制，因此阅读RL相关的文章时，我总有种“LLM在顾此失彼”的感觉。

OpenAI的Shunyu说：“RL finally works.” 
我不完全同意。我认为更准确地说，RL finally works with specific rules.

https://arxiv.org/abs/2503.04697
