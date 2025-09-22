「 SWE Agent, Data Scaling Law 」

Skywork-SWE: Unveiling Data Scaling Laws for Software Engineering in LLMs

Data scaling law，只要数据继续增长，SWE Agent 的性能几乎呈 log-linear上升，且尚未见饱和。

作者构建全自动、执行可验证的data pipeline，构建了Skywork-SWE 数据集，并验证了data scaling law 在
SWE 任务上的适用性。

值得注意的是，作者发现“长上下文与多轮交互” 对 Agent 表现起到关键作用。

将 rollout ( try-observe-edit-test) 轮数从 10 增至 100，可带来近 10 pp 的解决率增益。

https://www.arxiv.org/abs/2506.19290

文章中提到 "Code agent frameworks matter more than model size" 且超过一半的 SWE 类的评估方法都采用了OpenHands. 

「 SWE Agent, SQL 」

SWE-SQL: Illuminating LLM Pathways to Solve User SQL Issues in Real-World Applications

SWE Agent 在数据库中的形态 SWE-SQL

针对 SQL 调试难题，作者构建了：
数据集（BIRD-CRITIC）
训练环境（SIX-GYM），
开源 SQL Agent（BIRD-FIXER），非常solid！

对比 SWE Bench的 code repo，SWE-SQL的场景是错误 SQL + 业务描述，而SQL 即 Action，来交互数据库环境，并获知状态。

期待作者之后 BIRD-Interact + SWE-SQL 的工作！

https://www.arxiv.org/abs/2506.18951


「SWE Agent, Codex, ClaudeCode」

SWE-agent 是我的必读paper之一。

它提出的 ACI (Agent Computer Interface) 已经开始成为 code agent 的形态。

这篇，粗线条梳理我个人喜欢的 SWE Agent系列论文。

2023， SWE-bench
首次提出面向 GitHub issue 的 SWE Benchmark，模型需修改整仓库代码才能通过测试。彼时，Claude 2 只能解决 1.96 % 的任务。

2024， SWE-agent
设计 ACI (Agent Computer Interface) 让 LLM 使用linux shell cli， 循环 读-改-测 repo， ReAct + GPT-4 在SWE-bench 解决率 12.5 %

2024， SWE-bench Verified
OpenAI 通过去除不可解和不可靠样本，形成新的更加可靠的benchmark，SWE-bench Verified， GPT-4o， 33.2 %

2024/2025 SWE-Gym
设计 Gym 环境，可供SWE agent 提供verifier进行训练，enable test time scaling。

2025， SWE-Fixer
训练 Retrieval+ Editing, BM25+小模型筛文件，大模型（基座Llama 70b）做patching，SWE-bench Verified表现 32.8。

2025， SWE-RL
Meta 将RL与SWE Agent结合，Llama3-SWE-RL-70B在SWE-bench Verified，41.0%

2025， SWE-smith
新的data pipeline为SWE Agent提供大规模训练数据， SWE-agent-LM-32B，40.2 %

2025， SWE-factory
用multi-agent的方法，蒸馏SWE Agent训练数据。

2025, Claude 3.5 Sonnet
SWE-bench Verified表现 49%

2025， GPT-4.1
SWE-bench Verified表现54.6%

论文/文章 list：

SWE-bench: Can Language Models Resolve Real-World GitHub Issues?

SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering

Training Software Engineering Agents and Verifiers with SWE-Gym

SWE-Fixer: Training Open-Source LLMs for Effective and Efficient GitHub Issue Resolution

SWE-RL: Advancing LLM Reasoning via RL on Open Software Evolution

SWE-smith: Scaling Data for Software Engineering Agents

Introducing SWE-bench Verified

Raising the bar on SWE-bench Verified with Claude 3.5 Sonnet

Introducing GPT-4.1 in the API
