「LLM, Reasoning」论文：
Rethinking Reflection in Pre-Training

预训练卷土重来，reasoning 时代神奇的 “wait” 再现。

本周我最喜欢的一篇论文来了。

来自 Essential AI，由 Ashish Vaswani 主导，对写过论文的人来说，这个引用太熟悉了 （Vaswani et al., 2017）， Transformer 论文第一作者。

论文提出一个非常重要的发现：LLM 在 pretraining 阶段就已经表现出跨任务、跨领域的 general reasoning 能力。更特别的是，一个简单的 token ——“wait”—— 可以作为 reflection trigger，显著提升模型的 reasoning 表现。

相比当前主流的 post-training 方法，不断精细 reward model 的策略，这项工作跳出box，从新的角度审视大模型reasoning的问题。

说实话，RL 的各种 reward 操作看得人有点累觉不爱，而且在提升 general reasoning 上已经逐渐显现出瓶颈 —— 许多方法仍然停留在 task-specific 的 math benchmark 上，并没有真正触及 reasoning 的本质：跨领域、跨任务、可迁移。

相比之下，pretraining 的方法显得更为“neat” —— 不仅更敏捷，也更接近 LLM 的能力本源。

Make pretraining Great Again!

<img width="1200" height="573" alt="image" src="https://github.com/user-attachments/assets/3cd29c4c-8342-4b15-9f2d-a9d03c7b6f26" />

https://arxiv.org/abs/2504.04022
