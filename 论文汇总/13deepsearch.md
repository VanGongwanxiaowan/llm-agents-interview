「 Deep Search 」

Decoupled Planning and Execution: A Hierarchical Reasoning Framework for Deep Search

解耦 “规划” 与 “执行”，HiRA显著提升 Deep Search 推理效率和可扩展性，更让我想起被低估的 “ReWOO”。

传统单Agent既要做策略规划又要调用工具，导致能力扩展受限、推理链被执行细节噪声打断、上下文爆炸等问题。

作者提出HiRA，将规划和执行完全解耦。

- Meta Reasoning Planner： 纯语言链式思考，不直接触碰工具，避免执行噪声污染推理上下文

- Adaptive Reasoning Coordinator： 为每个子任务甄选最合适的专家代理，并把结果精炼后回馈给 Planner

-Dual-Channel Memory： 共享事实与资源，设计非常smart

插播 ReWOO：
读完论文，让我想起ReAct时期的一篇论文，ReWoo (非常被低估，目前citation仅80）。

ReWoo是一篇非常好的轻量级解偶规划和执行的早期Agent文章，介绍了非常实用且省token的工作流，planner -> worker -> solver。

Papers:

HiRA
https://arxiv.org/abs/2507.02652
ReWoo
https://arxiv.org/abs/2305.18323

