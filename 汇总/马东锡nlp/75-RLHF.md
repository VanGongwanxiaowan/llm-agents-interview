Reinforcement Learning with Human Feedback的价值巨大，第一次在方法上，把人类的value训练进LLM。
人类的value在RLHF的最初被定义为helpful，useful，non-harmful。

如今LLM reasoning的能力，拓宽人类的value定义的范畴。
因为reasoning的benmarking更加吸引人，让我们似乎忘记了最初RLHF多么重要。

换句话说，无论想增强LLM的什么能力，不论与人类的value符合与否，都可以套RLHF的方法。

Agent最有价值的地方不是对着一堆资料各种RAG，各种summarization。

Agent最有价值的地方，是策略性的做细分领域tool calling，这个tool是护城河。这个tool可以完成复杂的计算，本质是本文但超越文本。

如果看到一个所谓的Agent项目没有精细深度的tool，基本可以判断为垃圾。

马东锡 NLP
@dongxi_nlp
·
Apr 4
一旦明白，Large Reasoning Model眼花缭乱的RL方法都跟RLHF有直接关系后，所有链条就都理顺了。


马东锡 NLP
@dongxi_nlp
·
Apr 3
「LLM x RL」大语言模型语境下的RL和Policy

我们看当下 LLM x RL 的文章，如 RLHF、RLAIF、PPO、DPO、GPRO，这些 RL 方法五花八门，眼花缭乱。去看论文，数学公式都有半页纸那么长。

这些 RL 方法有一个共通点：无论其中的 P 在名字中是 policy 还是 preference，本质上，PPO、DPO、GPRO 都是对 policy 的优化方法。

那么，Policy 到底是什么？在 LLM 的语境中，它又代表什么？

在纯 RL 的语境中：
Policy 是一个函数或模型，它将 状态（state）映射为动作（action）。

具体来说，就是在状态 s 下采取动作 a 的概率。比如今天下雨了，我要带伞的概率，就比较大，我的内心世界对下雨和带伞有一个状态和动作的policy。

在 LLM 的语境中：
无论有没有 agent，无论是否明确设定动作，语言模型的生成行为本身就是一个“策略”在输出 token。所以对应 RL 概念：

状态（state） = 当前的输入文本 / 提示（prompt）或已有的上下文
动作（action） = 接下来要生成的词、token，或整个回答

策略（policy） = 模型根据输入，生成每个可能 token 的概率分布
换句话说：

Policy 在 LLM 语境中，其实就是语言模型本身。

所有的 PPO、DPO、GPRO 的目标，都是在优化这个 policy。
如果用 LLM 更熟悉的术语来说，那就是：

用 RL 的方法来微调语言模型的参数。

<img width="1200" height="675" alt="image" src="https://github.com/user-attachments/assets/6844d733-64cf-4688-80ef-5b56d1e1253e" />
