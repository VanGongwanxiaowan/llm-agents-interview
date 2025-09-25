「Agent, Reasoning」论文
Sleep-time Compute: Beyond Inference Scaling at Test-time

"I was asleep, but my heart was awake." — Song of Songs 5:2
 模型沉眠，算思未止。

这篇论文提出了一个并不学术的概念：“Sleep-time Compute” —— 这是作者自己定义的术语。

如果将用户的 query 作为分界线，模型在接收到 query 之后被视为“唤醒阶段” test-time compute，在此之前则为“睡眠阶段” sleep-time compute。

假设我们有一个任务，可以被拆分为两个部分：
完整任务 = context + 用户 query

传统上，context 和 query 会一起送给 LLM。
如果是一个具备推理能力（thinking）的模型，它会进行一段冗长的“思考”，即 test-time compute，
这不仅无法复用 context，还会导致推理延迟高。

而这篇论文将 context 和 query 明确分开：

Sleep-time 阶段：
让 LLM 只接收 context。
LLM 的任务是：“思考这个 context，有哪些可能有用的信息？” 这些信息会被结构化为一种“状态”（state）保存下来。

Test-time 阶段：
用户发出具体 query，模型现在接收：query+上一步 sleep-time 阶段生成的state。
模型基于已有状态，快速完成最终回答，几乎不再需要重新处理原始 context。

需要说明的是：
LLM 在 test-time 并不是停止推理，而是因为已经提前计算出了“可复用的中间结果”，比如推理过程，原理公式，图表信息，使得后续的推理路径变短、变轻、变高效。

Sleep-time Compute 存在显著的局限性：它要求 context 明确且稳定。典型应用包括：
固定代码库（如一个 repo）
知识库问答系统（如产品文档）

但如果面对 open question，context 是不确定的，
Sleep-time Compute 就无法提前得知“该准备哪些信息”，因而不适用。

从学术角度讲，这不是我最喜欢的论文，它没有从根本上解决test time scaling的效率问题；但从工程实践角度来说，它非常优秀。

我重新看了一下作者信息，来自 Letta 和 伯克利，
而 Letta 是一家 AI IDE 公司 —— 他们的应用场景正是 context 极其固定的代码库。

所以，一切都 make sense 了。

<img width="1200" height="752" alt="image" src="https://github.com/user-attachments/assets/4d50889b-89b2-4dd7-a1ca-58bd576f34b9" />

paper:

https://arxiv.org/abs/2504.13171
