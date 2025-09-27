---
search:
  boost: 2
tags:
  - agent
hide:
  - tags
---

# 评估

要评估您的智能体性能，您可以使用 `LangSmith` [评估](https://docs.smith.langchain.com/evaluation)。您需要首先定义一个评估器函数来评判智能体的结果，例如最终输出或轨迹。根据您的评估技术，这可能涉及也可能不涉及参考输出：

:::python

```python
def evaluator(*, outputs: dict, reference_outputs: dict):
    # compare agent outputs against reference outputs
    output_messages = outputs["messages"]
    reference_messages = reference_outputs["messages"]
    score = compare_messages(output_messages, reference_messages)
    return {"key": "evaluator_score", "score": score}
```

:::

:::js

```typescript
type EvaluatorParams = {
  outputs: Record<string, any>;
  referenceOutputs: Record<string, any>;
};

function evaluator({ outputs, referenceOutputs }: EvaluatorParams) {
  // compare agent outputs against reference outputs
  const outputMessages = outputs.messages;
  const referenceMessages = referenceOutputs.messages;
  const score = compareMessages(outputMessages, referenceMessages);
  return { key: "evaluator_score", score: score };
}
```

:::

要开始使用，您可以使用 `AgentEvals` 包中的预构建评估器：

:::python

```bash
pip install -U agentevals
```

:::

:::js

```bash
npm install agentevals
```

:::

## 创建评估器

评估智能体性能的常见方法是将智能体的轨迹（调用工具的顺序）与参考轨迹进行比较：

:::python

```python
import json
# highlight-next-line
from agentevals.trajectory.match import create_trajectory_match_evaluator

outputs = [
    {
        "role": "assistant",
        "tool_calls": [
            {
                "function": {
                    "name": "get_weather",
                    "arguments": json.dumps({"city": "san francisco"}),
                }
            },
            {
                "function": {
                    "name": "get_directions",
                    "arguments": json.dumps({"destination": "presidio"}),
                }
            }
        ],
    }
]
reference_outputs = [
    {
        "role": "assistant",
        "tool_calls": [
            {
                "function": {
                    "name": "get_weather",
                    "arguments": json.dumps({"city": "san francisco"}),
                }
            },
        ],
    }
]

# Create the evaluator
evaluator = create_trajectory_match_evaluator(
    # highlight-next-line
    trajectory_match_mode="superset",  # (1)!
)

# Run the evaluator
result = evaluator(
    outputs=outputs, reference_outputs=reference_outputs
)
```

:::

:::js

```typescript
import { createTrajectoryMatchEvaluator } from "agentevals/trajectory/match";

const outputs = [
  {
    role: "assistant",
    tool_calls: [
      {
        function: {
          name: "get_weather",
          arguments: JSON.stringify({ city: "san francisco" }),
        },
      },
      {
        function: {
          name: "get_directions",
          arguments: JSON.stringify({ destination: "presidio" }),
        },
      },
    ],
  },
];

const referenceOutputs = [
  {
    role: "assistant",
    tool_calls: [
      {
        function: {
          name: "get_weather",
          arguments: JSON.stringify({ city: "san francisco" }),
        },
      },
    ],
  },
];

// Create the evaluator
const evaluator = createTrajectoryMatchEvaluator({
  // Specify how the trajectories will be compared. `superset` will accept output trajectory as valid if it's a superset of the reference one. Other options include: strict, unordered and subset
  trajectoryMatchMode: "superset", // (1)!
});

// Run the evaluator
const result = evaluator({
  outputs: outputs,
  referenceOutputs: referenceOutputs,
});
```

:::

1. 指定如何比较轨迹。`superset` 如果输出轨迹是参考轨迹的超集，则将其视为有效。其他选项包括：[strict](https://github.com/langchain-ai/agentevals?tab=readme-ov-file#strict-match)、[unordered](https://github.com/langchain-ai/agentevals?tab=readme-ov-file#unordered-match) 和 [subset](https://github.com/langchain-ai/agentevals?tab=readme-ov-file#subset-and-superset-match)

作为下一步，了解更多关于如何[自定义轨迹匹配评估器](https://github.com/langchain-ai/agentevals?tab=readme-ov-file#agent-trajectory-match)。

### LLM 作为评判者

您可以使用 LLM 作为评判者的评估器，该评估器使用 LLM 将轨迹与参考输出进行比较并输出分数：

:::python

```python
import json
from agentevals.trajectory.llm import (
    # highlight-next-line
    create_trajectory_llm_as_judge,
    TRAJECTORY_ACCURACY_PROMPT_WITH_REFERENCE
)

evaluator = create_trajectory_llm_as_judge(
    prompt=TRAJECTORY_ACCURACY_PROMPT_WITH_REFERENCE,
    model="openai:o3-mini"
)
```

:::

:::js

```typescript
import {
  createTrajectoryLlmAsJudge,
  TRAJECTORY_ACCURACY_PROMPT_WITH_REFERENCE,
} from "agentevals/trajectory/llm";

const evaluator = createTrajectoryLlmAsJudge({
  prompt: TRAJECTORY_ACCURACY_PROMPT_WITH_REFERENCE,
  model: "openai:o3-mini",
});
```

:::

## 运行评估器

要运行评估器，您首先需要创建一个 [LangSmith 数据集](https://docs.smith.langchain.com/evaluation/concepts#datasets)。要使用预构建的 AgentEvals 评估器，您需要一个具有以下模式的数据集：

- **input**: `{"messages": [...]}` 用于调用智能体的输入消息。
- **output**: `{"messages": [...]}` 智能体输出中的预期消息历史。对于轨迹评估，您可以选择只保留助手消息。

:::python

```python
from langsmith import Client
from langgraph.prebuilt import create_react_agent
from agentevals.trajectory.match import create_trajectory_match_evaluator

client = Client()
agent = create_react_agent(...)
evaluator = create_trajectory_match_evaluator(...)

experiment_results = client.evaluate(
    lambda inputs: agent.invoke(inputs),
    # replace with your dataset name
    data="<Name of your dataset>",
    evaluators=[evaluator]
)
```

:::

:::js

```typescript
import { Client } from "langsmith";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createTrajectoryMatchEvaluator } from "agentevals/trajectory/match";

const client = new Client();
const agent = createReactAgent({...});
const evaluator = createTrajectoryMatchEvaluator({...});

const experimentResults = await client.evaluate(
    (inputs) => agent.invoke(inputs),
    // replace with your dataset name
    { data: "<Name of your dataset>" },
    { evaluators: [evaluator] }
);
```

:::
