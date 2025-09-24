「Post Training Recipe, RLVR」

Tülu 3: Pushing Frontiers in Open Language Model Post-Training

RLVR，可能是构建 Agentic LLM 最重要的方法，来自Nathan Lambert, 一位博士期间没有任何AI顶会文章的研究员。

一个重要的知识点： RLVR的首创者，不是DeepSeek R1, 而是AI2 的 Tülu 3。

上周大火的 AbsoluteZero 的主要方法是 Reinforcement Learning with Verifiable Rewards（RLVR)。我个人非常喜欢RLVR和LLM的结合，认为它是建造Agentic LLM的最佳方法。

很多作者，会简单把RLVR说成是一种DeepSeek “R1-style RL”，给人一种幻觉，似乎DeepSeek创造了RLVR。

但实际上，在2024年11月AI2 的 Tülu 3就提出了RLVR。并在这篇精彩的论文中，阐述了Tülu 3中post training precipe，从SFT, DPO 到RLVR的recipe。

虽然是2024年的论文，但依然常读常新，作者之一Nathan Lambert 
@natolambert
，如他自己的陈述，博士期间没有任何一篇AI顶会文章，但他是我（应该还有很多人），无可争议的最喜欢的 AI 研究员之一。

他对RLHF有精深的理解，也许这也是为什么，他提出的RLVR有着非常深刻的RLHF的影子，把 RLHF 中的“奖励模型” 替换成 确定性验证器。

论文很长，但值得mark下来多读几遍。

arxiv.org/abs/2411.15124

<img width="780" height="900" alt="image" src="https://github.com/user-attachments/assets/390e4017-e031-40e3-9cf4-580ee7d7d755" />

最近读论文的感想，RL优化的7B模型在tool call和多模态任务上频频吊打GPT-4o，意味着：

- SFT+RL、RLVR等后训练方法已成熟，垂直Agent领域可直接应用，做到 “原生”。
- 学术界，对这套recipe略显审美疲劳，Agent论文方法同质化严重。
- 工业界，Agent从业者该认真拥抱RL recipe了！

