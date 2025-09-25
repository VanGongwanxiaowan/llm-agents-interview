
马东锡 NLP
@dongxi_nlp
·
Mar 17
大语言模型 post-training 的变迁，从 Large Language Model (LLM) 到 Large Reasoning Model (LRM)

本周推荐论文：POST-TRAINING OF LARGE LANGUAGE MODELS

Post-training，本质是在做一件事，即如何运用 LLM 的 pretrained knowledge 来解决实际任务，具体的方法如 supervised fine-tuning（SFT）、instruction tuning 以及 reinforcement learning（RL）。

https://arxiv.org/abs/2503.06072

<img width="1129" height="984" alt="image" src="https://github.com/user-attachments/assets/09a21c11-794d-44bc-82c1-307afae1db68" />

马东锡 NLP
@dongxi_nlp
·
Mar 17
在过去的七年，post-training 随着 LLM 的发展，快速完成了多次范式转移，从解决 task-specific 或 domain-specific 任务向 generalization 进化，从基本文字任务到 complex reasoning 的方向演化。这种演化反映在实践中，就是带来 Agent 的爆发，这发生在现在和未来。

从 post-training 本身的发展来说，微调已经成为历史，RL 已经来临。

如这篇文章所述，SFT似乎只记住了微调数据集的分布，而RL 符合 LLM generalization 进化的方向。同时，RL 推动了 LLM 逐渐进化为 LRM。

先贴个transformer的RL工具，回归后会围绕LRM, 逐步分享Agent，Reasoning，以及RL.

https://github.com/huggingface/trl/tree/main/trl/scripts

从 Chain of Thought 到 aha moment和wait，看大模型的 test time scaling和深度思考

大模型们在过去的一年，都有了自己的deep search, think, reasoning, 深度思考...等关键词或者产品。
作为NLP从业者，我都会禁不住问自己，这都是些啥...😅今天就来解读这个问题，这些产品的所有本质，来自一个学术词汇，即test time scaling。

回归的第一篇，从test time scaling的角度，缕一遍从OpenAI o1 到DeepSeek R1, 从chain of thought，到所谓的aha moment。

最后，以一篇论文结束，谈谈如何微调来获得私域深度思考模型。

熟悉我的推友都还记得，我大概是最早把学术中的 CoT (Chain of Thought) 介绍给中文推的博主。

CoT 简言之，强行在 LLM 输入前加上一个静态的推理过程，从而提升了模型 reasoning 能力。
ReAct，把静态的 CoT 动态化，并配合外部 API，使得 LLM 在 reasoning 之后学会使用外部工具，成为初代 Agent。

事实上，诞生于2022 年CoT + ReAct，，时至今日依然是做 Agent 非常稳健的技术组合。

新读者可以去我的hightlight看关于CoT和ReAct的介绍。

马东锡 NLP
@dongxi_nlp
有趣的是，CoT 和 ReAct 的两位作者，Jason 和 Shunyu，目前都供职于 OpenAI。
从 Shunyu 的研究轨迹来看，无论是把 CoT 动态化，还是他做的 Tree of Thought，从如今的角度来看，做了一件事，即 test time scaling，即强行让 LLM 在输出最终结果前，不止输出一个 CoT，强行增加大模型在 inference 阶段或者 testing 阶段的计算力，来增强大模型的 reasoning 能力。


顺着这条线索，OpenAI o1 必然诞生了，只不过 OpenAI 的产品经理，把 test time scaling 变成人话，直接告诉你模型在 "思考"，"thinking"，"deep research"。
Test test scaling的缺点也是必然的，就是慢，因为增加testing阶段的计算力的直接结果就是输出的增加，作为用户能做的，就是等待。\

同样，DeepSeek R1 完成了 OpenAI o1 方法的浮现，甚至给了一个更不学术和更市场化的名词，"aha moment"，而其论文中对 aha moment 的解释：

DeepSeek-R1-Zero naturally learns to solve reasoning tasks with more thinking time
翻译成人话就是，test time scaling works。

<img width="1200" height="259" alt="image" src="https://github.com/user-attachments/assets/691b571a-79a2-43ca-8dba-0e7e73ad78f8" />




马东锡 NLP
@dongxi_nlp
·
Mar 16
在方法上，OpenAI o1 和 DeepSeek R1 是大致一样的，即用 reinforcement learning 的方法，把动态的长长的 CoT 嵌入模型之中，形成一个比较 generalized 的 test time scaling 的本质，获得了一种比较 general 的 reasoning 现象。


马东锡 NLP
@dongxi_nlp
·
Mar 16
更有趣的是，沿着 test time scaling 的路线，我们发现了类似于 "let’s think step by step" 的工作。我们都知道，"let’s think step by step" 会一步步让模型思考，从而提升表现。


<img width="598" height="504" alt="image" src="https://github.com/user-attachments/assets/0ab25995-d049-46e4-b13a-e6d3f49bcd39" />



马东锡 NLP
@dongxi_nlp
·
Mar 16
而在 thinking 时代，我们只需在知识蒸馏的时候，放一些 "wait"，来强行让reasoing的长度拉长，然后微调大模型使得它倾向于生成更长的‘类似于推理’的文字。 
关于“wait” 关键词的探索，请看s1这篇paper，在特别的数学领域，通过添加‘wait’关键词的知识蒸馏，击败了o1在数学benchmark上的表现。


<img width="1200" height="353" alt="image" src="https://github.com/user-attachments/assets/9fbd41fe-bf26-4ee2-beb7-0c66861a9803" />



到这里，prompt engineering的感觉又回来了，只不过，不是直接prompt llm来解决问题，而是用"wait"，"don’t stop"，"come on"，"I want more"，"等一下"，"不要停" 等等有点色情的提示词，生成长长的蒸馏微调推理数据，从而实现不需要RL， 通过简单的微调，也可以得到私域深度思考模型。

你学废了么😃

谢谢！我也不知道这个问题的准确答案，如果用推理模型来解决特别复杂的多步推理问题，一般来说，那么prompt要跟它的post training process一致：即如果推理模型的thinking含有大量aha，wait，对应的CoT的few shot也要含有大量用wait分割的不同推理轨迹。







