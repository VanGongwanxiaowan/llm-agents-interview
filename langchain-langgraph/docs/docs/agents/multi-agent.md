---
search:
  boost: 2
tags:
  - agent
hide:
  - tags
---

# 多智能体

如果单个智能体需要在多个领域专业化或管理许多工具，它可能会遇到困难。为了解决这个问题，您可以将智能体分解为更小的独立智能体，并将它们组合成[多智能体系统](../concepts/multi_agent.md)。

在多智能体系统中，智能体需要相互通信。它们通过[交接](#handoffs)来实现这一点——这是一个原语，描述将控制权交给哪个智能体以及发送给该智能体的有效载荷。

两种最流行的多智能体架构是：

- [监督者](#supervisor) — 个体智能体由中央监督者智能体协调。监督者控制所有通信流和任务委派，根据当前上下文和任务要求决定调用哪个智能体。
- [群体](#swarm) — 智能体根据其专业化动态地将控制权移交给彼此。系统记住最后活跃的智能体，确保在后续交互中，对话从该智能体继续。

## 监督者

![Supervisor](./assets/supervisor.png)

:::python
使用 [`langgraph-supervisor`](https://github.com/langchain-ai/langgraph-supervisor-py) 库创建监督者多智能体系统：

```bash
pip install langgraph-supervisor
```

```python
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
# highlight-next-line
from langgraph_supervisor import create_supervisor

def book_hotel(hotel_name: str):
    """预订酒店"""
    return f"成功预订了 {hotel_name} 的住宿。"

def book_flight(from_airport: str, to_airport: str):
    """预订航班"""
    return f"成功预订了从 {from_airport} 到 {to_airport} 的航班。"

flight_assistant = create_react_agent(
    model="openai:gpt-4o",
    tools=[book_flight],
    prompt="您是一个航班预订助手",
    # highlight-next-line
    name="flight_assistant"
)

hotel_assistant = create_react_agent(
    model="openai:gpt-4o",
    tools=[book_hotel],
    prompt="您是一个酒店预订助手",
    # highlight-next-line
    name="hotel_assistant"
)

# highlight-next-line
supervisor = create_supervisor(
    agents=[flight_assistant, hotel_assistant],
    model=ChatOpenAI(model="gpt-4o"),
    prompt=(
        "您管理一个酒店预订助手和一个"
        "航班预订助手。将工作分配给它们。"
    )
).compile()

for chunk in supervisor.stream(
    {
        "messages": [
            {
                "role": "user",
                "content": "book a flight from BOS to JFK and a stay at McKittrick Hotel"
            }
        ]
    }
):
    print(chunk)
    print("\n")
```

:::

:::js
使用 [`@langchain/langgraph-supervisor`](https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-supervisor) 库创建监督者多智能体系统：

```bash
npm install @langchain/langgraph-supervisor
```

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
// highlight-next-line
import { createSupervisor } from "langgraph-supervisor";

function bookHotel(hotelName: string) {
  /**预订酒店*/
  return `成功预订了 ${hotelName} 的住宿。`;
}

function bookFlight(fromAirport: string, toAirport: string) {
  /**预订航班*/
  return `成功预订了从 ${fromAirport} 到 ${toAirport} 的航班。`;
}

const flightAssistant = createReactAgent({
  llm: "openai:gpt-4o",
  tools: [bookFlight],
  stateModifier: "您是一个航班预订助手",
  // highlight-next-line
  name: "flight_assistant",
});

const hotelAssistant = createReactAgent({
  llm: "openai:gpt-4o",
  tools: [bookHotel],
  stateModifier: "您是一个酒店预订助手",
  // highlight-next-line
  name: "hotel_assistant",
});

// highlight-next-line
const supervisor = createSupervisor({
  agents: [flightAssistant, hotelAssistant],
  llm: new ChatOpenAI({ model: "gpt-4o" }),
  systemPrompt:
    "您管理一个酒店预订助手和一个 " +
    "航班预订助手。将工作分配给它们。",
});

for await (const chunk of supervisor.stream({
  messages: [
    {
      role: "user",
      content: "book a flight from BOS to JFK and a stay at McKittrick Hotel",
    },
  ],
})) {
  console.log(chunk);
  console.log("\n");
}
```

:::

## 群体

![Swarm](./assets/swarm.png)

:::python
使用 [`langgraph-swarm`](https://github.com/langchain-ai/langgraph-swarm-py) 库创建群体多智能体系统：

```bash
pip install langgraph-swarm
```

```python
from langgraph.prebuilt import create_react_agent
# highlight-next-line
from langgraph_swarm import create_swarm, create_handoff_tool

transfer_to_hotel_assistant = create_handoff_tool(
    agent_name="hotel_assistant",
    description="将用户移交给酒店预订助手。",
)
transfer_to_flight_assistant = create_handoff_tool(
    agent_name="flight_assistant",
    description="将用户移交给航班预订助手。",
)

flight_assistant = create_react_agent(
    model="anthropic:claude-3-5-sonnet-latest",
    # highlight-next-line
    tools=[book_flight, transfer_to_hotel_assistant],
    prompt="您是一个航班预订助手",
    # highlight-next-line
    name="flight_assistant"
)
hotel_assistant = create_react_agent(
    model="anthropic:claude-3-5-sonnet-latest",
    # highlight-next-line
    tools=[book_hotel, transfer_to_flight_assistant],
    prompt="您是一个酒店预订助手",
    # highlight-next-line
    name="hotel_assistant"
)

# highlight-next-line
swarm = create_swarm(
    agents=[flight_assistant, hotel_assistant],
    default_active_agent="flight_assistant"
).compile()

for chunk in swarm.stream(
    {
        "messages": [
            {
                "role": "user",
                "content": "book a flight from BOS to JFK and a stay at McKittrick Hotel"
            }
        ]
    }
):
    print(chunk)
    print("\n")
```

:::

:::js
使用 [`@langchain/langgraph-swarm`](https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-swarm) 库创建群体多智能体系统：

```bash
npm install @langchain/langgraph-swarm
```

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
// highlight-next-line
import { createSwarm, createHandoffTool } from "@langchain/langgraph-swarm";

const transferToHotelAssistant = createHandoffTool({
  agentName: "hotel_assistant",
  description: "将用户移交给酒店预订助手。",
});

const transferToFlightAssistant = createHandoffTool({
  agentName: "flight_assistant",
  description: "将用户移交给航班预订助手。",
});

const flightAssistant = createReactAgent({
  llm: "anthropic:claude-3-5-sonnet-latest",
  // highlight-next-line
  tools: [bookFlight, transferToHotelAssistant],
  stateModifier: "您是一个航班预订助手",
  // highlight-next-line
  name: "flight_assistant",
});

const hotelAssistant = createReactAgent({
  llm: "anthropic:claude-3-5-sonnet-latest",
  // highlight-next-line
  tools: [bookHotel, transferToFlightAssistant],
  stateModifier: "您是一个酒店预订助手",
  // highlight-next-line
  name: "hotel_assistant",
});

// highlight-next-line
const swarm = createSwarm({
  agents: [flightAssistant, hotelAssistant],
  defaultActiveAgent: "flight_assistant",
});

for await (const chunk of swarm.stream({
  messages: [
    {
      role: "user",
      content: "book a flight from BOS to JFK and a stay at McKittrick Hotel",
    },
  ],
})) {
  console.log(chunk);
  console.log("\n");
}
```

:::

## 交接

多智能体交互中的一个常见模式是**交接**，其中一个智能体将控制权移交给另一个智能体。交接允许您指定：

- **目标**：要导航到的目标智能体
- **有效载荷**：传递给该智能体的信息

:::python
这被 `langgraph-supervisor`（监督者移交给个体智能体）和 `langgraph-swarm`（个体智能体可以移交给其他智能体）使用。

要使用 `create_react_agent` 实现交接，您需要：

1.  创建一个可以将控制权转移给不同智能体的特殊工具

    ```python
    def transfer_to_bob():
        """移交给 bob。"""
        return Command(
            # 要移交到的智能体（节点）名称
            # highlight-next-line
            goto="bob",
            # 发送给智能体的数据
            # highlight-next-line
            update={"messages": [...]},
            # 向 LangGraph 指示我们需要导航到
            # 父图中的智能体节点
            # highlight-next-line
            graph=Command.PARENT,
        )
    ```

2.  创建可以访问交接工具的个体智能体：

    ```python
    flight_assistant = create_react_agent(
        ..., tools=[book_flight, transfer_to_hotel_assistant]
    )
    hotel_assistant = create_react_agent(
        ..., tools=[book_hotel, transfer_to_flight_assistant]
    )
    ```

3.  定义一个包含个体智能体作为节点的父图：

    ```python
    from langgraph.graph import StateGraph, MessagesState
    multi_agent_graph = (
        StateGraph(MessagesState)
        .add_node(flight_assistant)
        .add_node(hotel_assistant)
        ...
    )
    ```

:::

:::js
这被 `@langchain/langgraph-supervisor`（监督者移交给个体智能体）和 `@langchain/langgraph-swarm`（个体智能体可以移交给其他智能体）使用。

要使用 `createReactAgent` 实现交接，您需要：

1.  创建一个可以将控制权转移给不同智能体的特殊工具

    ```typescript
    function transferToBob() {
      /**移交给 bob。*/
      return new Command({
        // 要移交到的智能体（节点）名称
        // highlight-next-line
        goto: "bob",
        // 发送给智能体的数据
        // highlight-next-line
        update: { messages: [...] },
        // 向 LangGraph 指示我们需要导航到
        // 父图中的智能体节点
        // highlight-next-line
        graph: Command.PARENT,
      });
    }
    ```

2.  创建可以访问交接工具的个体智能体：

    ```typescript
    const flightAssistant = createReactAgent({
      ..., tools: [bookFlight, transferToHotelAssistant]
    });
    const hotelAssistant = createReactAgent({
      ..., tools: [bookHotel, transferToFlightAssistant]
    });
    ```

3.  定义一个包含个体智能体作为节点的父图：

    ```typescript
    import { StateGraph, MessagesZodState } from "@langchain/langgraph";
    const multiAgentGraph = new StateGraph(MessagesZodState)
      .addNode("flight_assistant", flightAssistant)
      .addNode("hotel_assistant", hotelAssistant)
      // ...
    ```

    :::

将这些组合在一起，以下是如何实现一个简单的多智能体系统，包含两个智能体——航班预订助手和酒店预订助手：

:::python

```python
from typing import Annotated
from langchain_core.tools import tool, InjectedToolCallId
from langgraph.prebuilt import create_react_agent, InjectedState
from langgraph.graph import StateGraph, START, MessagesState
from langgraph.types import Command

def create_handoff_tool(*, agent_name: str, description: str | None = None):
    name = f"transfer_to_{agent_name}"
    description = description or f"移交给 {agent_name}"

    @tool(name, description=description)
    def handoff_tool(
        # highlight-next-line
        state: Annotated[MessagesState, InjectedState], # (1)!
        # highlight-next-line
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> Command:
        tool_message = {
            "role": "tool",
            "content": f"成功移交给 {agent_name}",
            "name": name,
            "tool_call_id": tool_call_id,
        }
        return Command(  # (2)!
            # highlight-next-line
            goto=agent_name,  # (3)!
            # highlight-next-line
            update={"messages": state["messages"] + [tool_message]},  # (4)!
            # highlight-next-line
            graph=Command.PARENT,  # (5)!
        )
    return handoff_tool

# 交接
transfer_to_hotel_assistant = create_handoff_tool(
    agent_name="hotel_assistant",
    description="将用户移交给酒店预订助手。",
)
transfer_to_flight_assistant = create_handoff_tool(
    agent_name="flight_assistant",
    description="将用户移交给航班预订助手。",
)

# 简单智能体工具
def book_hotel(hotel_name: str):
    """预订酒店"""
    return f"成功预订了 {hotel_name} 的住宿。"

def book_flight(from_airport: str, to_airport: str):
    """预订航班"""
    return f"成功预订了从 {from_airport} 到 {to_airport} 的航班。"

# 定义智能体
flight_assistant = create_react_agent(
    model="anthropic:claude-3-5-sonnet-latest",
    # highlight-next-line
    tools=[book_flight, transfer_to_hotel_assistant],
    prompt="您是一个航班预订助手",
    # highlight-next-line
    name="flight_assistant"
)
hotel_assistant = create_react_agent(
    model="anthropic:claude-3-5-sonnet-latest",
    # highlight-next-line
    tools=[book_hotel, transfer_to_flight_assistant],
    prompt="您是一个酒店预订助手",
    # highlight-next-line
    name="hotel_assistant"
)

# 定义多智能体图
multi_agent_graph = (
    StateGraph(MessagesState)
    .add_node(flight_assistant)
    .add_node(hotel_assistant)
    .add_edge(START, "flight_assistant")
    .compile()
)

# 运行多智能体图
for chunk in multi_agent_graph.stream(
    {
        "messages": [
            {
                "role": "user",
                "content": "book a flight from BOS to JFK and a stay at McKittrick Hotel"
            }
        ]
    }
):
    print(chunk)
    print("\n")
```

1. 访问智能体的状态
2. `Command` 原语允许将状态更新和节点转换指定为单个操作，这使得它对于实现交接很有用。
3. 要移交给的智能体或节点的名称。
4. 将智能体的消息作为交接的一部分**添加**到父级的**状态**中。下一个智能体将看到父级状态。
5. 向 LangGraph 指示我们需要导航到**父级**多智能体图中的智能体节点。
   :::

:::js

```typescript
import { tool } from "@langchain/core/tools";
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
  StateGraph,
  START,
  MessagesZodState,
  Command,
} from "@langchain/langgraph";
import { z } from "zod";

function createHandoffTool({
  agentName,
  description,
}: {
  agentName: string;
  description?: string;
}) {
  const name = `transfer_to_${agentName}`;
  const toolDescription = description || `移交给 ${agentName}`;

  return tool(
    async (_, config) => {
      const toolMessage = {
        role: "tool" as const,
        content: `成功移交给 ${agentName}`,
        name: name,
        tool_call_id: config.toolCall?.id!,
      };
      return new Command({
        // (2)!
        // highlight-next-line
        goto: agentName, // (3)!
        // highlight-next-line
        update: { messages: [toolMessage] }, // (4)!
        // highlight-next-line
        graph: Command.PARENT, // (5)!
      });
    },
    {
      name,
      description: toolDescription,
      schema: z.object({}),
    }
  );
}

// 交接
const transferToHotelAssistant = createHandoffTool({
  agentName: "hotel_assistant",
  description: "将用户移交给酒店预订助手。",
});

const transferToFlightAssistant = createHandoffTool({
  agentName: "flight_assistant",
  description: "将用户移交给航班预订助手。",
});

// 简单智能体工具
const bookHotel = tool(
  async ({ hotelName }) => {
    /**预订酒店*/
    return `成功预订了 ${hotelName} 的住宿。`;
  },
  {
    name: "book_hotel",
    description: "预订酒店",
    schema: z.object({
      hotelName: z.string().describe("要预订的酒店名称"),
    }),
  }
);

const bookFlight = tool(
  async ({ fromAirport, toAirport }) => {
    /**预订航班*/
    return `成功预订了从 ${fromAirport} 到 ${toAirport} 的航班。`;
  },
  {
    name: "book_flight",
    description: "预订航班",
    schema: z.object({
      fromAirport: z.string().describe("出发机场代码"),
      toAirport: z.string().describe("到达机场代码"),
    }),
  }
);

// 定义智能体
const flightAssistant = createReactAgent({
  llm: new ChatAnthropic({ model: "anthropic:claude-3-5-sonnet-latest" }),
  // highlight-next-line
  tools: [bookFlight, transferToHotelAssistant],
  stateModifier: "您是一个航班预订助手",
  // highlight-next-line
  name: "flight_assistant",
});

const hotelAssistant = createReactAgent({
  llm: new ChatAnthropic({ model: "anthropic:claude-3-5-sonnet-latest" }),
  // highlight-next-line
  tools: [bookHotel, transferToFlightAssistant],
  stateModifier: "您是一个酒店预订助手",
  // highlight-next-line
  name: "hotel_assistant",
});

// 定义多智能体图
const multiAgentGraph = new StateGraph(MessagesZodState)
  .addNode("flight_assistant", flightAssistant)
  .addNode("hotel_assistant", hotelAssistant)
  .addEdge(START, "flight_assistant")
  .compile();

// 运行多智能体图
for await (const chunk of multiAgentGraph.stream({
  messages: [
    {
      role: "user",
      content: "book a flight from BOS to JFK and a stay at McKittrick Hotel",
    },
  ],
})) {
  console.log(chunk);
  console.log("\n");
}
```

1. 访问智能体的状态
2. `Command` 原语允许将状态更新和节点转换指定为单个操作，这使得它对于实现交接很有用。
3. 要移交给的智能体或节点的名称。
4. 将智能体的消息作为交接的一部分**添加**到父级的**状态**中。下一个智能体将看到父级状态。
5. 向 LangGraph 指示我们需要导航到**父级**多智能体图中的智能体节点。

:::

!!! 注意

    此交接实现假设：

    - 每个智能体接收多智能体系统中所有智能体的整体消息历史作为其输入
    - 每个智能体将其内部消息历史输出到多智能体系统的整体消息历史中

:::python
查看 LangGraph [supervisor](https://github.com/langchain-ai/langgraph-supervisor-py#customizing-handoff-tools) 和 [swarm](https://github.com/langchain-ai/langgraph-swarm-py#customizing-handoff-tools) 文档，了解如何自定义交接。
:::

:::js
查看 LangGraph [supervisor](https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-supervisor#customizing-handoff-tools) 和 [swarm](https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-swarm#customizing-handoff-tools) 文档，了解如何自定义交接。
:::
