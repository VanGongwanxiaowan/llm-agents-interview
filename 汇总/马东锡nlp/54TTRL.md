「LLM, Reasoning」论文

TTRL: Test-Time Reinforcement Learning

如同修心，向内求索、达成一致。TTRL用强化学习将 Self-Consistency 注入大语言模型。

非常出色的论文，作者试图解决是一个难度非常大的问题，即提高LLM在RL时代的general的reasoning能力。

RL天然是task specific的，需要task specific的 environment, action, state 和reward。另外，传统的RL一般需要标注数据来训练，例如标注好的不同的推理轨迹来训练模型。所以RL模型在新的task一般会underperform。

面对非常难的问题，作者的方法非常简洁： 利用RL将Self-Consistency内化进模型，让模型倾向于输出majority voting的内容。

什么是self-consistency？

简言之，少数服从多数。 
Self-consistency是让LLM对同一个prompt进行多次独立采样，生成多个不同的输出, 例如不同的CoT + 结果：

CoT-1 → result1 
CoT-2 → result2 
CoT-3 → result2

然后使用majority voting来提取最终结果：result2

这个方法非常简单，整个过程LLM无需训练。而且非常有效，在实践应用中是非常common的agent workflow。而且，无需外部真实标签，仅依靠模型自身的能力来判断哪些输出是好的。

TTRL借鉴了self-consistency的思想，通过强化学习，让模型学会将单次生成（或少数几次生成）的结果与多次采样后的多数投票结果对齐，从而将 Self-Consistency 的思想“内化”或“嵌入”到模型的策略中。

跟self-consistency不同，模型不再仅仅是在推理时需要外部采样和应用投票，而是学习到一种倾向于产生多数投票结果的内部策略。

如果从中国的修心哲学来看，TTRL在面对问题的时候，将“向内求索、达成一致”（self consistency），“内化”（RL）于“心” （模型参数）。

一些思考：

如果想要增强LLM在RL时代Generalreasoning的能力，RL的具体任务需要是一个general的任务。 例如，比起做数学题，让LLM倾向生成majority voting后的内容，更加general一些。

TTRL的本质，是self-consistency， self-consistency的本质是依靠模型本身的能力，所以TTRL严重依赖模型本身reasoning能力。

TTRL后的模型，采样能力下降，是否会影响模型进一步的探索？一个健康的模型是不是不该只有一种声音？

https://arxiv.org/abs/2504.16084
