# 模型

LangGraph 通过 LangChain 库为 [LLM（语言模型）](https://python.langchain.com/docs/concepts/chat_models/) 提供内置支持。这使得将各种 LLM 集成到您的智能体和工作流中变得容易。

## 初始化模型

:::python
使用 [`init_chat_model`](https://python.langchain.com/docs/how_to/chat_models_universal_init/) 来初始化模型：

{% include-markdown "../../snippets/chat_model_tabs.md" %}
:::

:::js
使用模型提供商类来初始化模型：

=== "OpenAI"

    ```typescript
    import { ChatOpenAI } from "@langchain/openai";

    const model = new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0,
    });
    ```

=== "Anthropic"

    ```typescript
    import { ChatAnthropic } from "@langchain/anthropic";

    const model = new ChatAnthropic({
      model: "claude-3-5-sonnet-20240620",
      temperature: 0,
      maxTokens: 2048,
    });
    ```

=== "Google"

    ```typescript
    import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-pro",
      temperature: 0,
    });
    ```

=== "Groq"

    ```typescript
    import { ChatGroq } from "@langchain/groq";

    const model = new ChatGroq({
      model: "llama-3.1-70b-versatile",
      temperature: 0,
    });
    ```

:::

:::python

### 直接实例化模型

如果模型提供商不通过 `init_chat_model` 提供，您可以直接实例化提供商的模型类。模型必须实现 [BaseChatModel 接口](https://python.langchain.com/api_reference/core/language_models/langchain_core.language_models.chat_models.BaseChatModel.html) 并支持工具调用：

```python
# Anthropic 已经通过 `init_chat_model` 支持，
# 但您也可以直接实例化它。
from langchain_anthropic import ChatAnthropic

model = ChatAnthropic(
  model="claude-3-7-sonnet-latest",
  temperature=0,
  max_tokens=2048
)
```

:::

!!! important "工具调用支持"

    如果您正在构建需要模型调用外部工具的智能体或工作流，请确保底层
    语言模型支持[工具调用](../concepts/tools.md)。兼容的模型可以在 [LangChain 集成目录](https://python.langchain.com/docs/integrations/chat/) 中找到。

## 在智能体中使用

:::python
使用 `create_react_agent` 时，您可以通过模型名称字符串指定模型，这是使用 `init_chat_model` 初始化模型的简写。这允许您使用模型而无需直接导入或实例化它。

=== "模型名称"

      ```python
      from langgraph.prebuilt import create_react_agent

      create_react_agent(
         # highlight-next-line
         model="anthropic:claude-3-7-sonnet-latest",
         # other parameters
      )
      ```

=== "模型实例"

      ```python
      from langchain_anthropic import ChatAnthropic
      from langgraph.prebuilt import create_react_agent

      model = ChatAnthropic(
          model="claude-3-7-sonnet-latest",
          temperature=0,
          max_tokens=2048
      )
      # Alternatively
      # model = init_chat_model("anthropic:claude-3-7-sonnet-latest")

      agent = create_react_agent(
        # highlight-next-line
        model=model,
        # other parameters
      )
      ```

:::

:::js
使用 `createReactAgent` 时，您可以直接传递模型实例：

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const model = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
});

const agent = createReactAgent({
  llm: model,
  tools: tools,
});
```

:::

:::python

### 动态模型选择

向 `create_react_agent` 传递一个可调用函数以在运行时动态选择模型。这对于您希望基于用户输入、配置设置或其他运行时条件选择模型的场景很有用。

选择器函数必须返回一个聊天模型。如果您使用工具，您必须在选择器函数内将工具绑定到模型。

  ```python
from dataclasses import dataclass
from typing import Literal
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.chat_agent_executor import AgentState
from langgraph.runtime import Runtime

@tool
def weather() -> str:
    """Returns the current weather conditions."""
    return "It's nice and sunny."


# Define the runtime context
@dataclass
class CustomContext:
    provider: Literal["anthropic", "openai"]

# Initialize models
openai_model = init_chat_model("openai:gpt-4o")
anthropic_model = init_chat_model("anthropic:claude-sonnet-4-20250514")


# Selector function for model choice
def select_model(state: AgentState, runtime: Runtime[CustomContext]) -> BaseChatModel:
    if runtime.context.provider == "anthropic":
        model = anthropic_model
    elif runtime.context.provider == "openai":
        model = openai_model
    else:
        raise ValueError(f"Unsupported provider: {runtime.context.provider}")

    # With dynamic model selection, you must bind tools explicitly
    return model.bind_tools([weather])


# Create agent with dynamic model selection
agent = create_react_agent(select_model, tools=[weather])

# Invoke with context to select model
output = agent.invoke(
    {
        "messages": [
            {
                "role": "user",
                "content": "Which model is handling this?",
            }
        ]
    },
    context=CustomContext(provider="openai"),
)

print(output["messages"][-1].text())
```

!!! version-added "LangGraph v0.6 新增"

:::

## 高级模型配置

### 禁用流式处理

:::python
要禁用单个 LLM 令牌的流式处理，在初始化模型时设置 `disable_streaming=True`：

=== "`init_chat_model`"

    ```python
    from langchain.chat_models import init_chat_model

    model = init_chat_model(
        "anthropic:claude-3-7-sonnet-latest",
        # highlight-next-line
        disable_streaming=True
    )
    ```

=== "`ChatModel`"

    ```python
    from langchain_anthropic import ChatAnthropic

    model = ChatAnthropic(
        model="claude-3-7-sonnet-latest",
        # highlight-next-line
        disable_streaming=True
    )
    ```

有关 `disable_streaming` 的更多信息，请参阅 [API 参考](https://python.langchain.com/api_reference/core/language_models/langchain_core.language_models.chat_models.BaseChatModel.html#langchain_core.language_models.chat_models.BaseChatModel.disable_streaming)
:::

:::js
要禁用单个 LLM 令牌的流式处理，在初始化模型时设置 `streaming: false`：

```typescript
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "gpt-4o",
  streaming: false,
});
```

:::

### 添加模型回退

:::python
您可以使用 `model.with_fallbacks([...])` 添加回退到不同模型或不同 LLM 提供商：

=== "`init_chat_model`"

    ```python
    from langchain.chat_models import init_chat_model

    model_with_fallbacks = (
        init_chat_model("anthropic:claude-3-5-haiku-latest")
        # highlight-next-line
        .with_fallbacks([
            init_chat_model("openai:gpt-4.1-mini"),
        ])
    )
    ```

=== "`ChatModel`"

    ```python
    from langchain_anthropic import ChatAnthropic
    from langchain_openai import ChatOpenAI

    model_with_fallbacks = (
        ChatAnthropic(model="claude-3-5-haiku-latest")
        # highlight-next-line
        .with_fallbacks([
            ChatOpenAI(model="gpt-4.1-mini"),
        ])
    )
    ```

有关模型回退的更多信息，请参阅此[指南](https://python.langchain.com/docs/how_to/fallbacks/#fallback-to-better-model)。
:::

:::js
您可以使用 `model.withFallbacks([...])` 添加回退到不同模型或不同 LLM 提供商：

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";

const modelWithFallbacks = new ChatOpenAI({
  model: "gpt-4o",
}).withFallbacks([
  new ChatAnthropic({
    model: "claude-3-5-sonnet-20240620",
  }),
]);
```

有关模型回退的更多信息，请参阅此[指南](https://js.langchain.com/docs/how_to/fallbacks/#fallback-to-better-model)。
:::

:::python

### 使用内置速率限制器

Langchain 包含一个内置的内存速率限制器。此速率限制器是线程安全的，可以在同一进程中的多个线程之间共享。

```python
from langchain_core.rate_limiters import InMemoryRateLimiter
from langchain_anthropic import ChatAnthropic

rate_limiter = InMemoryRateLimiter(
    requests_per_second=0.1,  # <-- Super slow! We can only make a request once every 10 seconds!!
    check_every_n_seconds=0.1,  # Wake up every 100 ms to check whether allowed to make a request,
    max_bucket_size=10,  # Controls the maximum burst size.
)

model = ChatAnthropic(
   model_name="claude-3-opus-20240229",
   rate_limiter=rate_limiter
)
```

有关如何[处理速率限制](https://python.langchain.com/docs/how_to/chat_model_rate_limiting/)的更多信息，请参阅 LangChain 文档。
:::

## 自带模型

如果您所需的 LLM 不被 LangChain 官方支持，请考虑这些选项：

:::python

1. **实现自定义 LangChain 聊天模型**：创建符合 [LangChain 聊天模型接口](https://python.langchain.com/docs/how_to/custom_chat_model/) 的模型。这实现了与 LangGraph 智能体和工作流的完全兼容，但需要理解 LangChain 框架。
   :::

:::js

1. **实现自定义 LangChain 聊天模型**：创建符合 [LangChain 聊天模型接口](https://js.langchain.com/docs/how_to/custom_chat/) 的模型。这实现了与 LangGraph 智能体和工作流的完全兼容，但需要理解 LangChain 框架。
   :::

2. **直接调用自定义流式处理**：通过使用 `StreamWriter` [添加自定义流式处理逻辑](../how-tos/streaming.md#use-with-any-llm) 直接使用您的模型。
   请参阅[自定义流式处理文档](../how-tos/streaming.md#use-with-any-llm) 获取指导。这种方法适用于不需要预构建智能体集成的自定义工作流。

## 其他资源

:::python

- [多模态输入](https://python.langchain.com/docs/how_to/multimodal_inputs/)
- [结构化输出](https://python.langchain.com/docs/how_to/structured_output/)
- [模型集成目录](https://python.langchain.com/docs/integrations/chat/)
- [强制模型调用特定工具](https://python.langchain.com/docs/how_to/tool_choice/)
- [所有聊天模型操作指南](https://python.langchain.com/docs/how_to/#chat-models)
- [聊天模型集成](https://python.langchain.com/docs/integrations/chat/)
  :::

:::js

- [多模态输入](https://js.langchain.com/docs/how_to/multimodal_inputs/)
- [结构化输出](https://js.langchain.com/docs/how_to/structured_output/)
- [模型集成目录](https://js.langchain.com/docs/integrations/chat/)
- [强制模型调用特定工具](https://js.langchain.com/docs/how_to/tool_choice/)
- [所有聊天模型操作指南](https://js.langchain.com/docs/how_to/#chat-models)
- [聊天模型集成](https://js.langchain.com/docs/integrations/chat/)
  :::
