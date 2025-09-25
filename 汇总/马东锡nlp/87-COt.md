
马东锡 NLP
@dongxi_nlp
·
Mar 16
Replying to 
@dongxi_nlp
熟悉我的推友都还记得，我大概是最早把学术中的 CoT (Chain of Thought) 介绍给中文推的博主。

CoT 简言之，强行在 LLM 输入前加上一个静态的推理过程，从而提升了模型 reasoning 能力。
ReAct，把静态的 CoT 动态化，并配合外部 API，使得 LLM 在 reasoning 之后学会使用外部工具，成为初代 Agent。

事实上，诞生于2022 年CoT + ReAct，，时至今日依然是做 Agent 非常稳健的技术组合。

新读者可以去我的hightlight看关于CoT和ReAct的介绍。

<img width="592" height="506" alt="image" src="https://github.com/user-attachments/assets/a9e5301a-2ce7-4ef6-9615-30251e29401c" />


马东锡 NLP
@dongxi_nlp
·
Jan 28
不论低成本训练的trick是什么，最底层基于的transformer的本质，就是为了迎合算力，attention is all you need论文的本质是为了迎合算力，不是attention。
只要transformer架构不被取代，scaling 和算力的良性互动还要继续膨胀下去。

马东锡 NLP
@dongxi_nlp
·
Apr 17, 2024
当所有研究者开始卷LLM Agent方法的时候，不论是memory、reflection还是planning，Reinforcement Learning的痕迹越发明显。只不过在LLM中，RL算法是通过口头推理（verbal reasoning）的方式prompt。

这引发了一个重要的疑问：RL中包含的极其复杂的数学公式，能否通过人类的自然口语来精确表达？

马东锡 NLP
@dongxi_nlp
·
Mar 18, 2024
transformer里的attention，MoE里的expert，Lora里的adapter。本质都是最简单的全联接前馈网络，太神奇了。有一种草台班子的即视感。


马东锡 NLP
@dongxi_nlp
·
Feb 23, 2024
ReWOO是我喜欢的LLM agent 工作流，planner，worker，solver的独立化模块化的设计，让任务执行更加清晰，同时因为没有显性的observation，大量节省token。

基于ReWOO, 我们团队设计了新的prompting 策略，outperform了rewoo和react，但被最近的一个nlp会议reject了。

过几天放出arXiv。

