---
search:
  boost: 2
tags:
  - agent
hide:
  - tags
---

# 运行智能体

智能体支持同步和异步执行，可以使用 `.invoke()` / `await .ainvoke()` 获取完整响应，或使用 `.stream()` / `.astream()` 获取**增量**[流式](../how-tos/streaming.md)输出。本节说明如何提供输入、解释输出、启用流式传输以及控制执行限制。

## 基本用法

智能体可以在两种主要模式下执行：

:::python

- **同步** 使用 `.invoke()` 或 `.stream()`
- **异步** 使用 `await .ainvoke()` 或 `async for` 与 `.astream()`
  :::

:::js

- **同步** 使用 `.invoke()` 或 `.stream()`
- **异步** 使用 `await .invoke()` 或 `for await` 与 `.stream()`
  :::

:::python
=== "同步调用"

    ```python
    from langgraph.prebuilt import create_react_agent

    agent = create_react_agent(...)

    # highlight-next-line
    response = agent.invoke({"messages": [{"role": "user", "content": "what is the weather in sf"}]})
    ```

=== "异步调用"

    ```python
    from langgraph.prebuilt import create_react_agent

    agent = create_react_agent(...)
    # highlight-next-line
    response = await agent.ainvoke({"messages": [{"role": "user", "content": "what is the weather in sf"}]})
    ```

:::

:::js

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const agent = createReactAgent(...);
// highlight-next-line
const response = await agent.invoke({
    "messages": [
        { "role": "user", "content": "what is the weather in sf" }
    ]
});
```

:::

## 输入和输出

智能体使用期望以 `messages` 列表作为输入的语言模型。因此，智能体的输入和输出作为 `messages` 键下的 `messages` 列表存储在智能体[状态](../concepts/low_level.md#working-with-messages-in-graph-state)中。

## 输入格式

智能体输入必须是包含 `messages` 键的字典。支持的格式有：

:::python
| 格式 | 示例 |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------|
| 字符串 | `{"messages": "Hello"}` — 解释为 [HumanMessage](https://python.langchain.com/docs/concepts/messages/#humanmessage) |
| 消息字典 | `{"messages": {"role": "user", "content": "Hello"}}` |
| 消息列表 | `{"messages": [{"role": "user", "content": "Hello"}]}` |
| 自定义状态 | `{"messages": [{"role": "user", "content": "Hello"}], "user_name": "Alice"}` — 如果使用自定义 `state_schema` |
:::

:::js
| 格式 | 示例 |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------|
| 字符串 | `{"messages": "Hello"}` — 解释为 [HumanMessage](https://js.langchain.com/docs/concepts/messages/#humanmessage) |
| 消息字典 | `{"messages": {"role": "user", "content": "Hello"}}` |
| 消息列表 | `{"messages": [{"role": "user", "content": "Hello"}]}` |
| 自定义状态 | `{"messages": [{"role": "user", "content": "Hello"}], "user_name": "Alice"}` — 如果使用自定义状态定义 |
:::

:::python
消息会自动转换为 LangChain 的内部消息格式。您可以在 LangChain 文档中阅读更多关于 [LangChain 消息](https://python.langchain.com/docs/concepts/messages/#langchain-messages)的信息。
:::

:::js
消息会自动转换为 LangChain 的内部消息格式。您可以在 LangChain 文档中阅读更多关于 [LangChain 消息](https://js.langchain.com/docs/concepts/messages/#langchain-messages)的信息。
:::

!!! tip "使用自定义智能体状态"

    :::python
    您可以直接在输入字典中提供智能体状态模式中定义的额外字段。这允许基于运行时数据或先前工具输出的动态行为。
    查看[上下文指南](./context.md)了解完整详情。
    :::

    :::js
    您可以直接在状态定义中提供智能体状态中定义的额外字段。这允许基于运行时数据或先前工具输出的动态行为。
    查看[上下文指南](./context.md)了解完整详情。
    :::

!!! note

    :::python
    `messages` 的字符串输入会转换为 [HumanMessage](https://python.langchain.com/docs/concepts/messages/#humanmessage)。此行为与 `create_react_agent` 中的 `prompt` 参数不同，后者在作为字符串传递时被解释为 [SystemMessage](https://python.langchain.com/docs/concepts/messages/#systemmessage)。
    :::

    :::js
    `messages` 的字符串输入会转换为 [HumanMessage](https://js.langchain.com/docs/concepts/messages/#humanmessage)。此行为与 `createReactAgent` 中的 `prompt` 参数不同，后者在作为字符串传递时被解释为 [SystemMessage](https://js.langchain.com/docs/concepts/messages/#systemmessage)。
    :::

## 输出格式

:::python
智能体输出是一个包含以下内容的字典：

- `messages`：执行期间交换的所有消息列表（用户输入、助手回复、工具调用）。
- 可选地，如果配置了[结构化输出](./agents.md#6-configure-structured-output)，则包含 `structured_response`。
- 如果使用自定义 `state_schema`，输出中可能还存在与您定义字段对应的额外键。这些可以保存来自工具执行或提示逻辑的更新状态值。
:::

:::js
智能体输出是一个包含以下内容的字典：

- `messages`：执行期间交换的所有消息列表（用户输入、助手回复、工具调用）。
- 可选地，如果配置了[结构化输出](./agents.md#6-configure-structured-output)，则包含 `structuredResponse`。
- 如果使用自定义状态定义，输出中可能还存在与您定义字段对应的额外键。这些可以保存来自工具执行或提示逻辑的更新状态值。
:::

查看[上下文指南](./context.md)了解有关使用自定义状态模式和访问上下文的更多详情。

## 流式输出

智能体支持流式响应以提供更响应的应用程序。这包括：

- 每步之后的**进度更新**
- **LLM 令牌**生成时
- 执行期间的**自定义工具消息**

流式传输在同步和异步模式下都可用：

:::python
=== "同步流式传输"

    ```python
    for chunk in agent.stream(
        {"messages": [{"role": "user", "content": "what is the weather in sf"}]},
        stream_mode="updates"
    ):
        print(chunk)
    ```

=== "异步流式传输"

    ```python
    async for chunk in agent.astream(
        {"messages": [{"role": "user", "content": "what is the weather in sf"}]},
        stream_mode="updates"
    ):
        print(chunk)
    ```

:::

:::js

```typescript
for await (const chunk of agent.stream(
  { messages: [{ role: "user", content: "what is the weather in sf" }] },
  { streamMode: "updates" }
)) {
  console.log(chunk);
}
```

:::

!!! tip

    有关完整详情，请查看[流式传输指南](../how-tos/streaming.md)。

## 最大迭代次数

:::python
要控制智能体执行并避免无限循环，请设置递归限制。这定义了智能体在抛出 `GraphRecursionError` 之前可以执行的最大步数。您可以在运行时或通过 `.with_config()` 定义智能体时配置 `recursion_limit`：
:::

:::js
要控制智能体执行并避免无限循环，请设置递归限制。这定义了智能体在抛出 `GraphRecursionError` 之前可以执行的最大步数。您可以在运行时或通过 `.withConfig()` 定义智能体时配置 `recursionLimit`：
:::

:::python
=== "运行时"

    ```python
    from langgraph.errors import GraphRecursionError
    from langgraph.prebuilt import create_react_agent

    max_iterations = 3
    # highlight-next-line
    recursion_limit = 2 * max_iterations + 1
    agent = create_react_agent(
        model="anthropic:claude-3-5-haiku-latest",
        tools=[get_weather]
    )

    try:
        response = agent.invoke(
            {"messages": [{"role": "user", "content": "what's the weather in sf"}]},
            # highlight-next-line
            {"recursion_limit": recursion_limit},
        )
    except GraphRecursionError:
        print("智能体因达到最大迭代次数而停止。")
    ```

=== "`.with_config()`"

    ```python
    from langgraph.errors import GraphRecursionError
    from langgraph.prebuilt import create_react_agent

    max_iterations = 3
    # highlight-next-line
    recursion_limit = 2 * max_iterations + 1
    agent = create_react_agent(
        model="anthropic:claude-3-5-haiku-latest",
        tools=[get_weather]
    )
    # highlight-next-line
    agent_with_recursion_limit = agent.with_config(recursion_limit=recursion_limit)

    try:
        response = agent_with_recursion_limit.invoke(
            {"messages": [{"role": "user", "content": "what's the weather in sf"}]},
        )
    except GraphRecursionError:
        print("智能体因达到最大迭代次数而停止。")
    ```

:::

:::js
=== "运行时"

    ```typescript
    import { GraphRecursionError } from "@langchain/langgraph";
    import { ChatAnthropic } from "@langchain/langgraph/prebuilt";
    import { createReactAgent } from "@langchain/langgraph/prebuilt";

    const maxIterations = 3;
    // highlight-next-line
    const recursionLimit = 2 * maxIterations + 1;
    const agent = createReactAgent({
        llm: new ChatAnthropic({ model: "claude-3-5-haiku-latest" }),
        tools: [getWeather]
    });

    try {
        const response = await agent.invoke(
            {"messages": [{"role": "user", "content": "what's the weather in sf"}]},
            // highlight-next-line
            { recursionLimit }
        );
    } catch (error) {
        if (error instanceof GraphRecursionError) {
            console.log("智能体因达到最大迭代次数而停止。");
        }
    }
    ```

=== "`.withConfig()`"

    ```typescript
    import { GraphRecursionError } from "@langchain/langgraph";
    import { ChatAnthropic } from "@langchain/langgraph/prebuilt";
    import { createReactAgent } from "@langchain/langgraph/prebuilt";

    const maxIterations = 3;
    // highlight-next-line
    const recursionLimit = 2 * maxIterations + 1;
    const agent = createReactAgent({
        llm: new ChatAnthropic({ model: "claude-3-5-haiku-latest" }),
        tools: [getWeather]
    });
    // highlight-next-line
    const agentWithRecursionLimit = agent.withConfig({ recursionLimit });

    try {
        const response = await agentWithRecursionLimit.invoke(
            {"messages": [{"role": "user", "content": "what's the weather in sf"}]},
        );
    } catch (error) {
        if (error instanceof GraphRecursionError) {
            console.log("智能体因达到最大迭代次数而停止。");
        }
    }
    ```

:::

:::python

## 其他资源

- [LangChain 中的异步编程](https://python.langchain.com/docs/concepts/async)
  :::



我来帮您将 LangGraph 运行智能体文档翻译成中文。


[22 tools called]

现在检查是否有任何语法错误：


[1 tool called]

完美！我已经成功将 LangGraph 运行智能体文档翻译成中文。以下是翻译完成的总结：

## 翻译完成总结

✅ **已完成的任务：**

### 1. **文档标题和介绍翻译**
- "Running agents" → "运行智能体"
- 翻译了完整的介绍段落，解释了同步/异步执行和流式输出

### 2. **基本用法部分翻译**
- "Basic usage" → "基本用法"
- "Synchronous" → "同步"
- "Asynchronous" → "异步"
- "Sync invocation" → "同步调用"
- "Async invocation" → "异步调用"

### 3. **输入输出格式部分翻译**
- "Inputs and outputs" → "输入和输出"
- "Input format" → "输入格式"
- "Output format" → "输出格式"
- 翻译了所有表格标题：
  - "Format" → "格式"
  - "Example" → "示例"
  - "String" → "字符串"
  - "Message dictionary" → "消息字典"
  - "List of messages" → "消息列表"
  - "With custom state" → "自定义状态"

### 4. **提示框和注释翻译**
- "Using custom agent state" → "使用自定义智能体状态"
- 翻译了所有提示框内容，包括自定义状态的使用说明
- 翻译了关于消息转换的注意事项

### 5. **流式输出部分翻译**
- "Streaming output" → "流式输出"
- "Progress updates" → "进度更新"
- "LLM tokens" → "LLM 令牌"
- "Custom tool messages" → "自定义工具消息"
- "Sync streaming" → "同步流式传输"
- "Async streaming" → "异步流式传输"
- 翻译了流式传输指南的引用

### 6. **最大迭代次数部分翻译**
- "Max iterations" → "最大迭代次数"
- "Runtime" → "运行时"
- 翻译了递归限制的说明和配置方法
- 翻译了所有代码示例中的错误消息：
  - "Agent stopped due to max iterations." → "智能体因达到最大迭代次数而停止。"

### 7. **其他资源部分翻译**
- "Additional Resources" → "其他资源"
- "Async programming in LangChain" → "LangChain 中的异步编程"

## 翻译特点

- **术语一致性**：统一使用"智能体"、"同步"、"异步"、"流式传输"等专业术语
- **技术准确性**：保持了所有技术概念的准确性，如 `GraphRecursionError`、`recursion_limit` 等
- **代码注释翻译**：翻译了代码示例中的注释和错误消息
- **可读性**：中文表达自然流畅，符合中文技术文档习惯
- **格式完整性**：完全保持了原有的 Markdown 格式、代码块和标签结构
- **链接保持**：所有外部链接都保持原样

文档现在完全中文化，为中文用户提供了清晰的智能体运行指南，包括基本用法、输入输出格式、流式传输和迭代控制等核心功能的使用说明。