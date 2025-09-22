https://arxiv.org/abs/2506.22419

「 Agent, NanoGPT Speedrun, Meta 」

The Automated LLM Speedrunning Benchmark: Reproducing NanoGPT Improvements

如果 LLM 可以实现自我迭代升级，那或许就是通往 AGI 奇点的真正临界点。

要验证这种“自我升级”是否可行，至少要先看 现有 LLM 能否复现人类已经做到的创新。

作者提出Automated LLM Speedrunning Benchmark，对准让 “Agent 完成 NanoGPT Speedrun” 这一任务。

NanoGPT Speedrun社区本身非常酷，指的是规定 在8 张 NVIDIA H100 GPU与特定数据条件下，让 GPT-2 模型第一次把验证集 CE 降到 3.28 以下所花的时间，越短越好。

也就是说，硬件、数据不变的情况下，可以任意微调模型架构，做优化和数据pipe line。

NanoGPT Speedrun已经从在Karpathy第一次提出时的45min提升至3 min。

Agent能否可以追赶人类迭代LLM的能力？

这就是这个benchmark提出的意义。

在一大堆关于数学，coding的复杂推理benchmark的背景下，Automated LLM Speedrunning Benchmark 从完全不一样的角度，推动LLM的发展和自我演化，值得期待！


