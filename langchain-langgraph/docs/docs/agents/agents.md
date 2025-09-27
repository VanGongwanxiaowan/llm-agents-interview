---
search:
  boost: 2
tags:
  - agent
hide:
  - tags
---

# LangGraph 快速入门

本指南向您展示如何设置和使用 LangGraph 的**预构建**、**可重用**组件，这些组件旨在帮助您快速可靠地构建智能体系统。

## 先决条件

在开始本教程之前，请确保您具备以下条件：

- 一个 [Anthropic](https://console.anthropic.com/settings/keys) API 密钥

## 1. 安装依赖项

如果还没有安装，请安装 LangGraph 和 LangChain：

:::python

```
pip install -U langgraph "langchain[anthropic]"
```

!!! info

    安装 `langchain[anthropic]` 是为了让智能体能够调用[模型](https://python.langchain.com/docs/integrations/chat/)。

:::

:::js

```bash
npm install @langchain/langgraph @langchain/core @langchain/anthropic
```

!!! info

    安装 `@langchain/core` `@langchain/anthropic` 是为了让智能体能够调用[模型](https://js.langchain.com/docs/integrations/chat/)。

:::

## 2. 创建智能体

:::python
要创建智能体，请使用 @[`create_react_agent`][create_react_agent]：

```python
from langgraph.prebuilt import create_react_agent

def get_weather(city: str) -> str:  # (1)!
    """Get weather for a given city."""
    return f"It's always sunny in {city}!"

agent = create_react_agent(
    model="anthropic:claude-3-7-sonnet-latest",  # (2)!
    tools=[get_weather],  # (3)!
    prompt="You are a helpful assistant"  # (4)!
)

# Run the agent
agent.invoke(
    {"messages": [{"role": "user", "content": "what is the weather in sf"}]}
)
```

1. 为智能体定义一个工具。工具可以定义为普通的 Python 函数。有关更高级的工具使用和自定义，请查看[工具](../how-tos/tool-calling.md)页面。
2. 为智能体提供语言模型。要了解有关为智能体配置语言模型的更多信息，请查看[模型](./models.md)页面。
3. 为模型提供工具列表。
4. 为智能体使用的语言模型提供系统提示（指令）。
   :::

:::js
要创建智能体，请使用 [`createReactAgent`](https://langchain-ai.github.io/langgraphjs/reference/functions/langgraph_prebuilt.createReactAgent.html)：

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const getWeather = tool(
  // (1)!
  async ({ city }) => {
    return `It's always sunny in ${city}!`;
  },
  {
    name: "get_weather",
    description: "Get weather for a given city.",
    schema: z.object({
      city: z.string().describe("The city to get weather for"),
    }),
  }
);

const agent = createReactAgent({
  llm: new ChatAnthropic({ model: "anthropic:claude-3-5-sonnet-latest" }), // (2)!
  tools: [getWeather], // (3)!
  stateModifier: "You are a helpful assistant", // (4)!
});

// Run the agent
await agent.invoke({
  messages: [{ role: "user", content: "what is the weather in sf" }],
});
```

1. 为智能体定义一个工具。工具可以使用 `tool` 函数定义。有关更高级的工具使用和自定义，请查看[工具](./tools.md)页面。
2. 为智能体提供语言模型。要了解有关为智能体配置语言模型的更多信息，请查看[模型](./models.md)页面。
3. 为模型提供工具列表。
4. 为智能体使用的语言模型提供系统提示（指令）。
   :::

## 3. 配置 LLM

:::python
要使用特定参数（如温度）配置 LLM，请使用 [init_chat_model](https://python.langchain.com/api_reference/langchain/chat_models/langchain.chat_models.base.init_chat_model.html)：

```python
from langchain.chat_models import init_chat_model
from langgraph.prebuilt import create_react_agent

# highlight-next-line
model = init_chat_model(
    "anthropic:claude-3-7-sonnet-latest",
    # highlight-next-line
    temperature=0
)

agent = create_react_agent(
    # highlight-next-line
    model=model,
    tools=[get_weather],
)
```

:::

:::js
要使用特定参数（如温度）配置 LLM，请使用模型实例：

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// highlight-next-line
const model = new ChatAnthropic({
  model: "claude-3-5-sonnet-latest",
  // highlight-next-line
  temperature: 0,
});

const agent = createReactAgent({
  // highlight-next-line
  llm: model,
  tools: [getWeather],
});
```

:::

有关如何配置 LLM 的更多信息，请参阅[模型](./models.md)。

## 4. 添加自定义提示

提示指导 LLM 如何行为。添加以下类型的提示之一：

- **静态**：字符串被解释为**系统消息**。
- **动态**：基于输入或配置在**运行时**生成的消息列表。

=== "静态提示"

    定义固定的提示字符串或消息列表：

    :::python
    ```python
    from langgraph.prebuilt import create_react_agent

    agent = create_react_agent(
        model="anthropic:claude-3-7-sonnet-latest",
        tools=[get_weather],
        # A static prompt that never changes
        # highlight-next-line
        prompt="Never answer questions about the weather."
    )

    agent.invoke(
        {"messages": [{"role": "user", "content": "what is the weather in sf"}]}
    )
    ```
    :::

    :::js
    ```typescript
    import { createReactAgent } from "@langchain/langgraph/prebuilt";
    import { ChatAnthropic } from "@langchain/anthropic";

    const agent = createReactAgent({
      llm: new ChatAnthropic({ model: "anthropic:claude-3-5-sonnet-latest" }),
      tools: [getWeather],
      // A static prompt that never changes
      // highlight-next-line
      stateModifier: "Never answer questions about the weather."
    });

    await agent.invoke({
      messages: [{ role: "user", content: "what is the weather in sf" }]
    });
    ```
    :::

=== "动态提示"

    :::python
    定义一个基于智能体状态和配置返回消息列表的函数：

    ```python
    from langchain_core.messages import AnyMessage
    from langchain_core.runnables import RunnableConfig
    from langgraph.prebuilt.chat_agent_executor import AgentState
    from langgraph.prebuilt import create_react_agent

    # highlight-next-line
    def prompt(state: AgentState, config: RunnableConfig) -> list[AnyMessage]:  # (1)!
        user_name = config["configurable"].get("user_name")
        system_msg = f"You are a helpful assistant. Address the user as {user_name}."
        return [{"role": "system", "content": system_msg}] + state["messages"]

    agent = create_react_agent(
        model="anthropic:claude-3-7-sonnet-latest",
        tools=[get_weather],
        # highlight-next-line
        prompt=prompt
    )

    agent.invoke(
        {"messages": [{"role": "user", "content": "what is the weather in sf"}]},
        # highlight-next-line
        config={"configurable": {"user_name": "John Smith"}}
    )
    ```

    1. 动态提示允许在构建 LLM 输入时包含非消息[上下文](./context.md)，例如：

        - 运行时传递的信息，如 `user_id` 或 API 凭据（使用 `config`）。
        - 在多步骤推理过程中更新的内部智能体状态（使用 `state`）。

        动态提示可以定义为接受 `state` 和 `config` 并返回要发送给 LLM 的消息列表的函数。
    :::

    :::js
    定义一个基于智能体状态和配置返回消息的函数：

    ```typescript
    import { type BaseMessageLike } from "@langchain/core/messages";
    import { type RunnableConfig } from "@langchain/core/runnables";
    import { createReactAgent } from "@langchain/langgraph/prebuilt";

    // highlight-next-line
    const dynamicPrompt = (state: { messages: BaseMessageLike[] }, config: RunnableConfig): BaseMessageLike[] => {  // (1)!
      const userName = config.configurable?.user_name;
      const systemMsg = `You are a helpful assistant. Address the user as ${userName}.`;
      return [{ role: "system", content: systemMsg }, ...state.messages];
    };

    const agent = createReactAgent({
      llm: "anthropic:claude-3-5-sonnet-latest",
      tools: [getWeather],
      // highlight-next-line
      stateModifier: dynamicPrompt
    });

    await agent.invoke(
      { messages: [{ role: "user", content: "what is the weather in sf" }] },
      // highlight-next-line
      { configurable: { user_name: "John Smith" } }
    );
    ```

    1. 动态提示允许在构建 LLM 输入时包含非消息[上下文](./context.md)，例如：

        - 运行时传递的信息，如 `user_id` 或 API 凭据（使用 `config`）。
        - 在多步骤推理过程中更新的内部智能体状态（使用 `state`）。

        动态提示可以定义为接受 `state` 和 `config` 并返回要发送给 LLM 的消息列表的函数。
    :::

有关更多信息，请参阅[上下文](./context.md)。

## 5. 添加记忆

要允许与智能体进行多轮对话，您需要在创建智能体时通过提供检查点器来启用[持久化](../concepts/persistence.md)。在运行时，您需要提供包含 `thread_id` 的配置——对话（会话）的唯一标识符：

:::python

```python
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import InMemorySaver

# highlight-next-line
checkpointer = InMemorySaver()

agent = create_react_agent(
    model="anthropic:claude-3-7-sonnet-latest",
    tools=[get_weather],
    # highlight-next-line
    checkpointer=checkpointer  # (1)!
)

# Run the agent
# highlight-next-line
config = {"configurable": {"thread_id": "1"}}
sf_response = agent.invoke(
    {"messages": [{"role": "user", "content": "what is the weather in sf"}]},
    # highlight-next-line
    config  # (2)!
)
ny_response = agent.invoke(
    {"messages": [{"role": "user", "content": "what about new york?"}]},
    # highlight-next-line
    config
)
```

1. `checkpointer` 允许智能体在工具调用循环的每一步存储其状态。这启用了[短期记忆](../how-tos/memory/add-memory.md#add-short-term-memory)和[人在回路](../concepts/human_in_the_loop.md)功能。
2. 传递带有 `thread_id` 的配置，以便在未来的智能体调用中恢复相同的对话。
   :::

:::js

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";

// highlight-next-line
const checkpointer = new MemorySaver();

const agent = createReactAgent({
  llm: "anthropic:claude-3-5-sonnet-latest",
  tools: [getWeather],
  // highlight-next-line
  checkpointSaver: checkpointer, // (1)!
});

// Run the agent
// highlight-next-line
const config = { configurable: { thread_id: "1" } };
const sfResponse = await agent.invoke(
  { messages: [{ role: "user", content: "what is the weather in sf" }] },
  // highlight-next-line
  config // (2)!
);
const nyResponse = await agent.invoke(
  { messages: [{ role: "user", content: "what about new york?" }] },
  // highlight-next-line
  config
);
```

1. `checkpointSaver` 允许智能体在工具调用循环的每一步存储其状态。这启用了[短期记忆](../how-tos/memory/add-memory.md#add-short-term-memory)和[人在回路](../concepts/human_in_the_loop.md)功能。
2. 传递带有 `thread_id` 的配置，以便在未来的智能体调用中恢复相同的对话。
   :::

:::python
当您启用检查点器时，它会在提供的检查点器数据库（或内存中，如果使用 `InMemorySaver`）中存储智能体状态的每一步。
:::

:::js
当您启用检查点器时，它会在提供的检查点器数据库（或内存中，如果使用 `MemorySaver`）中存储智能体状态的每一步。
:::

请注意，在上面的示例中，当智能体第二次使用相同的 `thread_id` 调用时，第一次对话的原始消息历史会自动包含，连同新的用户输入。

有关更多信息，请参阅[记忆](../how-tos/memory/add-memory.md)。

## 6. 配置结构化输出

:::python
要生成符合模式的结构化响应，请使用 `response_format` 参数。模式可以使用 `Pydantic` 模型或 `TypedDict` 定义。结果可通过 `structured_response` 字段访问。

```python
from pydantic import BaseModel
from langgraph.prebuilt import create_react_agent

class WeatherResponse(BaseModel):
    conditions: str

agent = create_react_agent(
    model="anthropic:claude-3-7-sonnet-latest",
    tools=[get_weather],
    # highlight-next-line
    response_format=WeatherResponse  # (1)!
)

response = agent.invoke(
    {"messages": [{"role": "user", "content": "what is the weather in sf"}]}
)

# highlight-next-line
response["structured_response"]
```

1.  当提供 `response_format` 时，在智能体循环的末尾添加一个单独的步骤：智能体消息历史被传递给具有结构化输出的 LLM 以生成结构化响应。

        要为这个 LLM 提供系统提示，请使用元组 `(prompt, schema)`，例如 `response_format=(prompt, WeatherResponse)`。

    :::

:::js
要生成符合模式的结构化响应，请使用 `responseFormat` 参数。模式可以使用 `Zod` 模式定义。结果可通过 `structuredResponse` 字段访问。

```typescript
import { z } from "zod";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const WeatherResponse = z.object({
  conditions: z.string(),
});

const agent = createReactAgent({
  llm: "anthropic:claude-3-5-sonnet-latest",
  tools: [getWeather],
  // highlight-next-line
  responseFormat: WeatherResponse, // (1)!
});

const response = await agent.invoke({
  messages: [{ role: "user", content: "what is the weather in sf" }],
});

// highlight-next-line
response.structuredResponse;
```

1.  当提供 `responseFormat` 时，在智能体循环的末尾添加一个单独的步骤：智能体消息历史被传递给具有结构化输出的 LLM 以生成结构化响应。

        要为这个 LLM 提供系统提示，请使用对象 `{ prompt, schema }`，例如 `responseFormat: { prompt, schema: WeatherResponse }`。

    :::

!!! Note "LLM 后处理"

    结构化输出需要对 LLM 进行额外调用以根据模式格式化响应。

## 下一步

- [本地部署您的智能体](../tutorials/langgraph-platform/local-server.md)
- [了解有关预构建智能体的更多信息](../agents/overview.md)
- [LangGraph Platform 快速入门](../cloud/quick_start.md)
