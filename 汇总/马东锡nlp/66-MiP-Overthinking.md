「LLM, Reasoning」论文

Missing Premise exacerbates Overthinking: Are Reasoning Models losing Critical Thinking Skill?

世人都晓 reasoning 好，唯有 thinking 忘不了。

若没有判断力的推理，thiking 只是更漂亮的误解；MiP-Overthinking 提供了重新审视 test-time scaling 的视角。

MiP-Overthinking 是什么？

在缺乏关键信息（Missing Premise）的情况下，LLM仍然执着地展开长篇推理，给出看似合理、实则无效甚至错误的回答，这种行为被称为 MiP-Overthinking（在缺失前提下的过度思考）。

Critical thiking 是什么？

识别问题的有效性：问题是否合理、是否成立？
判断信息是否充分：是否能得出可靠结论？
选择性推理或拒答：当信息不足时，主动拒绝推理或质疑前提。
避免“虚构性推理”：不因形式合理而忽视内容的荒谬。

论文发现：

推理训练过度强化“完成任务”的倾向，而不是“判断是否该完成任务”。这使得模型在面对MiP时仍然执意“答题”，而不是质疑题目本身。  

表现优异的推理模型反而更容易陷入MiP-Overthinking，因为它们过于擅长形式推理，以至于即使缺乏关键信息，仍倾向于生成表面连贯但逻辑上空洞的回答。

对test time scaling的审视：

当前 RLHF 和类似 DeepSeek R1 或 OpenAI o1 的训练流程强化了模型“完成任务”的能力，却未有效奖励模型“判断任务是否成立”的能力，间接导致了 MiP-Overthinking 的系统性倾向。


<img width="1200" height="508" alt="image" src="https://github.com/user-attachments/assets/7668b669-0665-4e70-9ec7-7e90f5663c97" />

https://arxiv.org/abs/2504.06514

