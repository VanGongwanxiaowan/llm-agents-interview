### 9. Tools 的评估指标
### 9.1 任务规划评估（Task Planning Evaluation）：
- **工具使用意识（Tool Usage Awareness）**：
  - 评估 **LLMs** 是否能够**准确识别何时需要使用外部工具**。
- **任务规划效果（Effectiveness of Task Planning）**：
  - 使用通过率（pass rate）或人类评估来衡量**任务规划解决查询的有效性**。
- **规划精度（Precision of the Plan）**：
  - 通过与最优解决方案比较，定量分析 **LLMs** **生成计划的准确性**。

### 9.2 工具选择评估（Tool Selection Evaluation）：
- **召回率（Recall）**：
  - 衡量**模型选择的前K个工具中有多少是正确的**。
- **归一化折扣累积增益（NDCG, Normalized Discounted Cumulative Gain）**：
  NDCG，一种用于评估排序算法质量的指标，它考虑了结果的相关性和位置重要性，通过对排序靠前的相关结果给予更高权重来衡量排序效果的好坏。
  - 不仅考虑召回，还**考虑工具排序位置的影响，对于排名合理性有更精细衡量**。
- **完整性（COMP, Completeness）**：
  - 评估所选出的 Top - k 工具结合起来**是否能覆盖所有真实答案所需工具，即是否完整**。

### 9.3 工具调用评估（Tool Calling Evaluation）：
聚焦于模型调用工具时生成的请求参数，评估重点在于：
- 模型生成的参数是否符合工具文档要求的格式和规范，包括参数内容的正确性及格式一致性。

### 9.4 响应生成评估（Response Generation Evaluation）：

最终通过工具调用增强模型的能力，其评估则转向：
- 使用常见的文本评估指标如BLEU，ROUGE- L，Exact Match来衡量模型对下游任务的完成质量
### 9.5 评估计算公式以及记录

<img width="594" height="448" alt="image" src="https://github.com/user-attachments/assets/b1938cfe-f875-4694-84b1-244a7abe8155" />

<img width="590" height="389" alt="image" src="https://github.com/user-attachments/assets/f323d138-8b7f-434a-8b0f-4c0f82082572" />


<img width="698" height="503" alt="image" src="https://github.com/user-attachments/assets/17cc6624-4910-4dfc-a917-b9bd34b38a41" />


<img width="722" height="508" alt="image" src="https://github.com/user-attachments/assets/80b74b6b-46be-4925-9d65-77bb3b49abbc" />

### 9.6 小结
### 🚗 Tools 的评估指标
1. **任务规划评估（Task Planning Evaluation）**：
    - **工具使用意识（Tool Usage Awareness）**：
    - **任务规划效果（Effectiveness of Task Planning）**：
    - **规划精度（Precision of the Plan）**：
2. **工具选择评估（Tool Selection Evaluation）**：
    - **召回率（Recall）**：
    - **归一化折扣累积增益（NDCG, Normalized Discounted Cumulative Gain）**：
    - **完整性（COMP, Completeness）**：
3. **工具调用评估（Tool Calling Evaluation）**：
    - **参数格式是否符合文档要求**。
    - **参数值是否正确、完整**。
4. **响应生成评估（Response Generation Evaluation）**：
    - **下游任务输出质量**。
    - **常用指标**：**BLEU**、**ROUGE - L**、**Exact Match**











