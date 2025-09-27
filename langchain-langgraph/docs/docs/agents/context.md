# 上下文

**上下文工程**是构建动态系统的实践，这些系统以正确的格式提供正确的信息和工具，以便 AI 应用程序能够完成任务。上下文可以沿着两个关键维度进行特征化：

1. 按**可变性**：
    - **静态上下文**：在执行期间不改变的不可变数据（例如，用户元数据、数据库连接、工具）
    - **动态上下文**：随着应用程序运行而演变的可变数据（例如，对话历史、中间结果、工具调用观察）
2. 按**生命周期**：
    - **运行时上下文**：限定为单次运行或调用的数据
    - **跨对话上下文**：跨多个对话或会话持续存在的数据

!!! tip "运行时上下文 vs LLM 上下文"

    运行时上下文指的是本地上下文：您的代码需要运行的数据和依赖项。它**不**指：

    * LLM 上下文，即传递给 LLM 提示的数据。
    * "上下文窗口"，即可以传递给 LLM 的最大令牌数。

    运行时上下文可用于优化 LLM 上下文。例如，您可以使用运行时上下文中的用户元数据来获取用户偏好并将其输入到上下文窗口中。

LangGraph 提供了三种管理上下文的方法，这些方法结合了可变性和生命周期维度：

:::python

| 上下文类型                                                                                | 描述                                            | 可变性 | 生命周期           | 访问方法                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------- | ------------------ | --------------------------------------- |
| [**静态运行时上下文**](#static-runtime-context)                                       | 在启动时传递的用户元数据、工具、数据库连接 | 静态     | 单次运行         | `invoke`/`stream` 的 `context` 参数 |
| [**动态运行时上下文（状态）**](#dynamic-runtime-context-state)                       | 在单次运行期间演变的可变数据          | 动态    | 单次运行         | LangGraph 状态对象                  |
| [**动态跨对话上下文（存储）**](#dynamic-cross-conversation-context-store) | 跨对话共享的持久数据            | 动态    | 跨对话 | LangGraph 存储                         |

## 静态运行时上下文

**静态运行时上下文**表示不可变数据，如用户元数据、工具和数据库连接，这些数据通过 `invoke`/`stream` 的 `context` 参数在运行开始时传递给应用程序。此数据在执行期间不会改变。

!!! version-added "LangGraph v0.6 新增：`context` 替换 `config['configurable']`"

    运行时上下文现在传递给 `invoke`/`stream` 的 `context` 参数，
    这替换了之前将应用程序配置传递给 `config['configurable']` 的模式。

```python
@dataclass
class ContextSchema:
    user_name: str

graph.invoke( # (1)!
    {"messages": [{"role": "user", "content": "hi!"}]}, # (2)!
    # highlight-next-line
    context={"user_name": "John Smith"} # (3)!
)
```

1. 这是智能体或图的调用。`invoke` 方法使用提供的输入运行底层图。
2. 此示例使用消息作为输入，这很常见，但您的应用程序可能使用不同的输入结构。
3. 这是您传递运行时数据的地方。`context` 参数允许您提供智能体在执行期间可以使用的附加依赖项。

=== "智能体提示"

    ```python
    from langchain_core.messages import AnyMessage
    from langgraph.runtime import get_runtime
    from langgraph.prebuilt.chat_agent_executor import AgentState
    from langgraph.prebuilt import create_react_agent

    # highlight-next-line
    def prompt(state: AgentState) -> list[AnyMessage]:
        runtime = get_runtime(ContextSchema)
        system_msg = f"You are a helpful assistant. Address the user as {runtime.context.user_name}."
        return [{"role": "system", "content": system_msg}] + state["messages"]

    agent = create_react_agent(
        model="anthropic:claude-3-7-sonnet-latest",
        tools=[get_weather],
        prompt=prompt,
        context_schema=ContextSchema
    )

    agent.invoke(
        {"messages": [{"role": "user", "content": "what is the weather in sf"}]},
        # highlight-next-line
        context={"user_name": "John Smith"}
    )
    ```

    * 有关详细信息，请参阅[智能体](../agents/agents.md)。

=== "工作流节点"

    ```python
    from langgraph.runtime import Runtime

    # highlight-next-line
    def node(state: State, runtime: Runtime[ContextSchema]):
        user_name = runtime.context.user_name
        ...
    ```

    * 有关详细信息，请参阅[图 API](https://langchain-ai.github.io/langgraph/how-tos/graph-api/#add-runtime-configuration)。

=== "在工具中"

    ```python
    from langgraph.runtime import get_runtime

    @tool
    # highlight-next-line
    def get_user_email() -> str:
        """Retrieve user information based on user ID."""
        # simulate fetching user info from a database
        runtime = get_runtime(ContextSchema)
        email = get_user_email_from_db(runtime.context.user_name)
        return email
    ```

    有关详细信息，请参阅[工具调用指南](../how-tos/tool-calling.md#configuration)。

!!! tip

    `Runtime` 对象可用于访问静态上下文和其他实用程序，如活动存储和流写入器。
    有关详细信息，请参阅[Runtime][langgraph.runtime.Runtime] 文档。

:::

:::js

| 上下文类型                                                                                | 描述                                   | 可变性 | 生命周期           |
| ------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------- | ------------------ |
| [**配置**](#config-static-context)                                                        | 在运行开始时传递的数据             | 静态     | 单次运行         |
| [**动态运行时上下文（状态）**](#dynamic-runtime-context-state)                       | 在单次运行期间演变的可变数据 | 动态    | 单次运行         |
| [**动态跨对话上下文（存储）**](#dynamic-cross-conversation-context-store) | 跨对话共享的持久数据   | 动态    | 跨对话 |

## 配置（静态上下文）

配置用于不可变数据，如用户元数据或 API 密钥。当您有在运行期间不改变的值时使用此选项。

使用名为 **"configurable"** 的键指定配置，该键为此目的保留。

```typescript
await graph.invoke(
  // (1)!
  { messages: [{ role: "user", content: "hi!" }] }, // (2)!
  // highlight-next-line
  { configurable: { user_id: "user_123" } } // (3)!
);
```

:::

## 动态运行时上下文（状态）

**动态运行时上下文**表示在单次运行期间可以演变的可变数据，通过 LangGraph 状态对象进行管理。这包括对话历史、中间结果以及从工具或 LLM 输出派生的值。在 LangGraph 中，状态对象在运行期间充当[短期记忆](../concepts/memory.md)。

=== "在智能体中"

    示例显示如何将状态合并到智能体**提示**中。

    状态也可以被智能体的**工具**访问，这些工具可以根据需要读取或更新状态。有关详细信息，请参阅[工具调用指南](../how-tos/tool-calling.md#short-term-memory)。

    :::python
    ```python
    from langchain_core.messages import AnyMessage
    from langchain_core.runnables import RunnableConfig
    from langgraph.prebuilt import create_react_agent
    from langgraph.prebuilt.chat_agent_executor import AgentState

    # highlight-next-line
    class CustomState(AgentState): # (1)!
        user_name: str

    def prompt(
        # highlight-next-line
        state: CustomState
    ) -> list[AnyMessage]:
        user_name = state["user_name"]
        system_msg = f"You are a helpful assistant. User's name is {user_name}"
        return [{"role": "system", "content": system_msg}] + state["messages"]

    agent = create_react_agent(
        model="anthropic:claude-3-7-sonnet-latest",
        tools=[...],
        # highlight-next-line
        state_schema=CustomState, # (2)!
        prompt=prompt
    )

    agent.invoke({
        "messages": "hi!",
        "user_name": "John Smith"
    })
    ```

    1. 定义一个扩展 `AgentState` 或 `MessagesState` 的自定义状态模式。
    2. 将自定义状态模式传递给智能体。这允许智能体在执行期间访问和修改状态。
    :::

    :::js
    ```typescript
    import type { BaseMessage } from "@langchain/core/messages";
    import { createReactAgent } from "@langchain/langgraph/prebuilt";
    import { MessagesZodState } from "@langchain/langgraph";
    import { z } from "zod";

    // highlight-next-line
    const CustomState = z.object({ // (1)!
      messages: MessagesZodState.shape.messages,
      userName: z.string(),
    });

    const prompt = (
      // highlight-next-line
      state: z.infer<typeof CustomState>
    ): BaseMessage[] => {
      const userName = state.userName;
      const systemMsg = `You are a helpful assistant. User's name is ${userName}`;
      return [{ role: "system", content: systemMsg }, ...state.messages];
    };

    const agent = createReactAgent({
      llm: model,
      tools: [...],
      // highlight-next-line
      stateSchema: CustomState, // (2)!
      stateModifier: prompt,
    });

    await agent.invoke({
      messages: [{ role: "user", content: "hi!" }],
      userName: "John Smith",
    });
    ```

    1. 定义一个扩展 `MessagesZodState` 或创建新模式的自定义状态模式。
    2. 将自定义状态模式传递给智能体。这允许智能体在执行期间访问和修改状态。
    :::

=== "在工作流中"

    :::python
    ```python
    from typing_extensions import TypedDict
    from langchain_core.messages import AnyMessage
    from langgraph.graph import StateGraph

    # highlight-next-line
    class CustomState(TypedDict): # (1)!
        messages: list[AnyMessage]
        extra_field: int

    # highlight-next-line
    def node(state: CustomState): # (2)!
        messages = state["messages"]
        ...
        return { # (3)!
            # highlight-next-line
            "extra_field": state["extra_field"] + 1
        }

    builder = StateGraph(State)
    builder.add_node(node)
    builder.set_entry_point("node")
    graph = builder.compile()
    ```

    1. 定义自定义状态
    2. 在任何节点或工具中访问状态
    3. 图 API 设计为尽可能轻松地与状态一起工作。节点的返回值表示对状态的请求更新。
    :::

    :::js
    ```typescript
    import type { BaseMessage } from "@langchain/core/messages";
    import { StateGraph, MessagesZodState, START } from "@langchain/langgraph";
    import { z } from "zod";

    // highlight-next-line
    const CustomState = z.object({ // (1)!
      messages: MessagesZodState.shape.messages,
      extraField: z.number(),
    });

    const builder = new StateGraph(CustomState)
      .addNode("node", async (state) => { // (2)!
        const messages = state.messages;
        // ...
        return { // (3)!
          // highlight-next-line
          extraField: state.extraField + 1,
        };
      })
      .addEdge(START, "node");

    const graph = builder.compile();
    ```

    1. 定义自定义状态
    2. 在任何节点或工具中访问状态
    3. 图 API 设计为尽可能轻松地与状态一起工作。节点的返回值表示对状态的请求更新。
    :::

!!! tip "开启记忆"

    有关如何启用记忆的更多详细信息，请参阅[记忆指南](../how-tos/memory/add-memory.md)。这是一个强大的功能，允许您在多次调用中持久化智能体的状态。否则，状态仅限定为单次运行。

## 动态跨对话上下文（存储）

**动态跨对话上下文**表示跨多个对话或会话的持久、可变数据，通过 LangGraph 存储进行管理。这包括用户配置文件、偏好和历史交互。LangGraph 存储充当跨多次运行的[长期记忆](../concepts/memory.md#long-term-memory)。这可用于读取或更新持久事实（例如，用户配置文件、偏好、先前交互）。

有关更多信息，请参阅[记忆指南](../how-tos/memory/add-memory.md)。
