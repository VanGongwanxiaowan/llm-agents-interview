

### 🔧 1. ARTIST：强化学习与工具集成的代理推理框架

**ARTIST**（Agentic Reasoning and Tool Integration for LLMs via GRPO）提出了一种新的训练方法，结合了强化学习和工具集成：

* **协议 token**：在推理过程中，使用 `<think>`、`<tool_name>`、`<output>`、`<answer>` 等协议 token 来组织模型的内部推理和工具调用。

* **工具调用接口**：模型通过 `<tool_name>` 标签调用外部工具，获取 `<output>`，并将其整合到推理链中。

* **GRPO 微调**：采用 GRPO 方法进行微调，避免了传统 PPO 中 critic 的使用，通过对比学习优化策略。

* **奖励建模**：引入奖励掩蔽策略，确保梯度仅通过模型生成的 token 传播，避免工具输出的确定性影响。

该方法在多步骤任务中显著提高了模型的推理能力和工具集成效果。 ([arXiv][1])

---

### 🧠 2. Agent-as-Tool：分层决策与工具调用代理

**Agent-as-Tool** 框架提出了分层的代理设计：

* **协议 token**：使用 `<think>` 和 `<tool_calling>` 标签分别表示内部推理和工具调用指令。

* **工具调用接口**：引入了 `Toolcaller` 组件，负责执行由 `Planner` 生成的工具调用指令，并将结果返回给 `Planner`。

* **GRPO 微调**：采用 GRPO 方法对 `Planner` 进行微调，优化其决策能力。

* **奖励建模**：设计了平衡正确性和格式约束的奖励函数，确保模型生成有效且格式正确的响应。

该框架在多跳推理任务中表现出色，展示了分层代理结构在复杂任务中的优势。 ([arXiv][2])

---

### 🛠️ 3. MCP-Zero：从零开始的工具链构建

**MCP-Zero** 提出了一个主动构建工具链的框架：

* **协议 token**：使用 `<tool_assistant>` 标签明确指定所需的工具和任务。

* **工具调用接口**：模型通过主动请求构建任务特定的工具链，支持多轮跨域工具调用。

* **GRPO 微调**：采用 GRPO 方法进行微调，优化模型的主动工具选择和调用能力。

* **奖励建模**：通过奖励建模确保模型在构建工具链时的准确性和效率。

该方法有效减少了上下文开销，并提高了工具选择的准确性。 ([arXiv][3])

---

### 🔄 4. PiMoE：集成高精度计算与推理的 Token 级路由

**PiMoE** 提出了一个集成计算与推理的架构：

* **协议 token**：在推理过程中，模型根据需要选择计算专家或推理专家。

* **工具调用接口**：通过专家模块实现高精度计算和推理。

* **GRPO 微调**：采用 GRPO 方法对模型进行微调，优化其在计算和推理任务中的表现。

* **奖励建模**：通过奖励建模确保模型在计算和推理任务中的准确性和效率。

该方法在科学和工业智能系统中展现了高效、可解释和可扩展的优势。 ([arXiv][4])

---

如果您对上述方法的具体实现、代码或数据集感兴趣，欢迎进一步交流。

[1]: https://arxiv.org/html/2505.01441v1?utm_source=chatgpt.com "Agentic Reasoning and Tool Integration for LLMs via ..."
[2]: https://arxiv.org/html/2507.01489v1?utm_source=chatgpt.com "Agent-as-Tool: A Study on the Hierarchical Decision ..."
[3]: https://arxiv.org/abs/2506.01056?utm_source=chatgpt.com "MCP-Zero: Proactive Toolchain Construction for LLM Agents from Scratch"
[4]: https://arxiv.org/abs/2509.18169?utm_source=chatgpt.com "PiMoE: Token-Level Routing for Integrating High-Precision Computation and Reasoning"
