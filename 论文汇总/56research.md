「Agent, RAG, Reasoning」论文 
ReSearch: Learning to Reason with Search for LLMs via Reinforcement Learning  

ReSearch，充满了 ReAct 的影子。它教会模型“何时求助于世界”；但局限在于，ReSearch 只能依赖一种工具。  

作者提出了一种创新的框架，名为 ReSearch，旨在通过强化学习（RL）训练 LLM 在推理过程中有效地反复利用 search API 完成任务。  

从任务形式上，它解决的是增强LLM+ RAG的问题，但并不同于基于 embedding 的单轮相似度检索方法。

它关注的是多次 query、反复调用 search API 来完成信息查询任务。  并不同于基于embedding去单次算相似度的方法，它解决的是多次query，反复调用search API完成外部信息查询的问题。  

而反复调用 API，涉及推理能力去决策调用的时机，以及生成调用的参数 —— 这是一个典型的 agent + function calling 场景。

ReSearch目标将这种search的reasoning能力通过RL学到。  

具体来说，ReSearch 采用了专门为搜索功能设计的训练模版：  
<think>...</think>：表示模型的思考过程； 
<search>...</search>：表示模型发起的搜索查询； <result>...</result>：表示搜索引擎返回的结果； <answer>...</answer>：表示模型给出的最终答案。 

特别地，ReSearch 的奖励函数不是仅仅基于答案对错，而是采用 rule-based 的组合机制：基于答案的 F1 相似度 + 输出格式是否符合模板，以此优化 policy，微调语言模型参数。  

此时不免再次提及 ReAct：ReSearch 充满了 ReAct 的循环影子——：  
Reasoning：模型的思考过程； 
Action：模型发起的调用； 
Observation：工具返回的反馈。  

ReAct 是神作，它以 verbal reasoning （人话）的方式，将原本充满数学公式的 RL 概念转化为语言链式推理，让 LLM 学会如何使用工具，优雅而简洁。  

一些思考：  

ReSearch 以及前几天分享的 ReTool 是非常类似的工作，它们都通过强化学习微调，将使用工具的能力内化于语言模型中，增强工具调用的鲁棒性。  

但它们的局限性也非常明显：ReSearch 和 ReTool 都只支持一种工具 —— search API 和 code interpreter。  

而 ReAct，通过 Prompt Engineering，就可以灵活调用多个外部工具。  

ReSearch 和 ReTool 的 RL 框架是为“单工具、二选一调度”设计的。如果强行扩展为多工具，训练信号将更加稀疏、credit assignment 更加困难，其策略网络、reward assignment、以及 rollout 表达能力都需要重新设计。  

我们距离真正原生具备多轮、多工具能力的通用 Agent，还有一段距离。


https://arxiv.org/abs/2503.19470
