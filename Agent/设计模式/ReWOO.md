https://medium.com/@minhle_0210/on-short-of-rewoo-decoupling-reasoning-from-observations-for-efficient-augmented-language-models-151f53f09630

https://langchain-ai.github.io/langgraph/tutorials/rewoo/rewoo/


# 《ReWOO：为高效增强语言模型分离推理与观察》网页总结
## 一、核心背景与问题

1. **现有增强语言模型（ALM）瓶颈**：当前ALM依赖工具获取外部观察以提升推理能力，但存在显著缺陷，包括重复输入上下文和示例导致的提示冗余、工具请求过程中可能出现的停滞或断开连接（可能导致整个流程失败）、重复执行工具获取相同结果造成的资源浪费，以及由此引发的token消耗多、计算复杂度高、响应效率低等问题。

2. **典型案例**：以RAG（检索增强生成）系统为例，其虽能基于个人数据集提供准确信息以减少幻觉，但检索组件提供的所有相关文档直接输入提示，会产生严重的提示冗余；ReAct、RAT等框架虽借助工具提升推理质量，却受工具响应时间、执行稳定性影响较大。


## 二、ReWOO核心方案
### 1. 定义与核心价值
ReWOO（Reasoning WithOut Observation）是一种模块化范式，核心是将ALM的推理过程与外部观察分离，可实现：
- **效率提升**：在多步推理基准测试中，token使用效率提升5倍；
- **性能优化**：相比现有框架，准确率更高；
- **系统优势**：模块化设计提升适应性、可维护性与可扩展性，单个组件（如搜索引擎、思维流程）修改不影响整体范式。

### 2. 三大核心模块与工作流程
ReWOO将ALM的逐步推理、工具调用、总结功能拆分为三个独立模块，流程清晰：

|模块|核心功能|具体说明|
|----|----|----|
|Planner（规划器）|生成解决方案蓝图|利用LLM的可预测推理能力，输出包含有序元组（_Plan_ , _#Eₛ_）的蓝图；其中_Plan_是当前步骤的描述信息，_#Eₛ_（_s_为步骤编号）是用于存储对应Worker步骤有效证据的特定token，且可引用前期步骤的_#Eₛ_以支持依赖前期观察的任务|
|Worker（执行器）|获取外部证据|通过工具调用与环境交互，根据Planner的蓝图，填充_#Eₛ_对应的真实证据或观察结果|
|Solver（求解器）|生成最终解决方案|整合Planner的所有规划与Worker的所有证据，结合原始任务（如问答、动作请求状态返回）输出结果；同时可“谨慎”使用规划与证据，弥补Planner或Worker的部分错误，提升整体性能|

### 3. 与传统单体框架的差异
- **传统框架（观察依赖推理）**：用户任务先被上下文提示和示例包裹，输入LLM后生成思维（T）与动作（A），等待工具返回观察（O），再将O加入提示历史启动下一次LLM调用，存在上下文和示例反复输入的冗余问题。
- **ReWOO框架**：Planner先生成关联规划（P）并指令Worker获取证据（E），再将任务、P、E一同输入Solver生成最终结果，无重复输入冗余，流程更高效。


## 三、实验结果与优势验证
1. **性能与效率**：在公共NLP基准测试和定制任务中，ReWOO不仅性能优于其他方法，还大幅减少token使用量。

2. **容错能力**：专项研究表明，即使在工具故障场景下，ReWOO仍能保持较好表现。

3. **可扩展性**：具备通过指令定制和专业化实现通用推理卸载的潜力，为后续优化提供空间。

计划-工作-解决范式：涉及规划、执行工具调用和解决的核心方法。

及时减少冗余：最大限度地减少上下文和先前推理步骤的重复。

工具误用预防：减少不必要或不适当的工具使用情况。

专业化能力：允许将特定能力从大型 LLM 卸载到较小的模型。


Token效率：与传统方法相比，大幅减少Token消耗。

提高准确性：展示某些任务的准确性改进。

降低成本：由于减少令牌使用而降低计算成本。

灵活性：可适应各种类型的语言模型和工具。

稳健性：在工具发生故障的情况下表现出更好的性能。

## 四、未来发展方向


1. 模块化LLM微调；

2. 工具表示学习；

3. 系统图学习与优化；

4. 目标是推动ALM向可完全扩展的通用人工智能（AGI）靠近。


## 五、作者观点与建议


1. ReWOO应成为开发AI系统的标准，尤其适合重视可维护性、适应性且需保持准确率的场景；

2. 其模块化设计可使各组件作为独立服务运行，系统可表现为有向无环图，具备高可观测性与实用性。


## 六、参考资料

1. Xu等：《ReWOO: Decoupling Reasoning from Observations for Efficient Augmented Language Models》（https://arxiv.org/abs/2305.18323）

2. Lewis等：《Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks》（https://arxiv.org/abs/2005.11401）

3. Yao等：《ReAct: Synergizing reasoning and acting in language models》（https://arxiv.org/abs/2210.03629）

4. Wang等：《RAT: Retrieval Augmented Thoughts Elicit Context-Aware Reasoning in Long-Horizon Generation》（https://arxiv.org/abs/2403.05313v1）

5. Wei等：《Chain of thought prompting elicits reasoning in large language models》（https://arxiv.org/abs/2201.11903）



