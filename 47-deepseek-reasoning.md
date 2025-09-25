「DeepSeek, Reasoning」论文

DeepSeek-Prover-V2: Advancing Formal Mathematical Reasoning via Reinforcement Learning for Subgoal Decomposition

用"sorry"做占位符，sorry，除了硬核，无法可说。

DeepSeek这篇在reasoning的追求上，到了一个让普通老百姓不能理解的程度。

DeepSeek 的一系列推理模型，已经用test time scaling的方法，证明它有做奥赛数学题的reasoning能力。

但这不够，这篇论文不要已经work的非正式性自然语言推理过程，一定要formal theorem proving，要用数学正式表达的形式化推理，。怎么评价呢，“挺卷的反正就” 。

方法上，DeepSeek把“非正式分解 + 递归求解 + 强化学习”整合为一条pipeline：

- DeepSeek-V3 先用自然语言写出解题思路，同时把每一步翻译成 Lean 子目标（以 sorry 结尾）。
- 一个 7B 参数的 prover 模型递归地填补这些 sorry，得到完整 Lean 证明。
- 拼接后的“CoT + 正式证明”作为冷启动数据，再用 RL 微调，显式奖励"证明结构与分解保持一致"。

看完论文，一头雾水，为啥用sorry做占字符？

问了一下专门做数学研究的朋友，才知道，微软的Lean是专门用来做交互式地构造严谨证明，sorry就是Lean的本身对数学推导的占字符。😱

读完其他优秀的论文，我总会感叹exciting，amazing。

这篇只有，无法可说，sorry....

paper: https://github.com/deepseek-ai/DeepSeek-Prover-V2/blob/main/DeepSeek_Prover_V2.pdf

Microsoft Lean: https://github.com/leanprover/lean4/blob/master/src/Lean/Parser/Term.lean#L222


<img width="900" height="878" alt="image" src="https://github.com/user-attachments/assets/a0bf0fbb-2421-4904-bb1a-64492c646a80" />
