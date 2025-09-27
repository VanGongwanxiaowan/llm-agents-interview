---
search:
  boost: 2
tags:
  - agent
hide:
  - tags
---

# 使用 MCP

[模型上下文协议 (MCP)](https://modelcontextprotocol.io/introduction) 是一个开放协议，标准化了应用程序如何向语言模型提供工具和上下文。LangGraph 智能体可以通过 `langchain-mcp-adapters` 库使用在 MCP 服务器上定义的工具。

![MCP](./assets/mcp.png)

:::python
安装 `langchain-mcp-adapters` 库以在 LangGraph 中使用 MCP 工具：

```bash
pip install langchain-mcp-adapters
```

:::

:::js
安装 `@langchain/mcp-adapters` 库以在 LangGraph 中使用 MCP 工具：

```bash
npm install langchain-mcp-adapters
```

:::

## 使用 MCP 工具

:::python
`langchain-mcp-adapters` 包使智能体能够使用在一个或多个 MCP 服务器上定义的工具。

=== "在智能体中"

    ```python title="使用在 MCP 服务器上定义的工具的智能体"
    # highlight-next-line
    from langchain_mcp_adapters.client import MultiServerMCPClient
    from langgraph.prebuilt import create_react_agent

    # highlight-next-line
    client = MultiServerMCPClient(
        {
            "math": {
                "command": "python",
                # Replace with absolute path to your math_server.py file
                "args": ["/path/to/math_server.py"],
                "transport": "stdio",
            },
            "weather": {
                # Ensure you start your weather server on port 8000
                "url": "http://localhost:8000/mcp",
                "transport": "streamable_http",
            }
        }
    )
    # highlight-next-line
    tools = await client.get_tools()
    agent = create_react_agent(
        "anthropic:claude-3-7-sonnet-latest",
        # highlight-next-line
        tools
    )
    math_response = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "what's (3 + 5) x 12?"}]}
    )
    weather_response = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "what is the weather in nyc?"}]}
    )
    ```

=== "在工作流中"

    ```python title="使用 ToolNode 的工作流使用 MCP 工具"
    from langchain_mcp_adapters.client import MultiServerMCPClient
    from langchain.chat_models import init_chat_model
    from langgraph.graph import StateGraph, MessagesState, START, END
    from langgraph.prebuilt import ToolNode

    # Initialize the model
    model = init_chat_model("anthropic:claude-3-5-sonnet-latest")

    # Set up MCP client
    client = MultiServerMCPClient(
        {
            "math": {
                "command": "python",
                # Make sure to update to the full absolute path to your math_server.py file
                "args": ["./examples/math_server.py"],
                "transport": "stdio",
            },
            "weather": {
                # make sure you start your weather server on port 8000
                "url": "http://localhost:8000/mcp/",
                "transport": "streamable_http",
            }
        }
    )
    tools = await client.get_tools()

    # Bind tools to model
    model_with_tools = model.bind_tools(tools)

    # Create ToolNode
    tool_node = ToolNode(tools)

    def should_continue(state: MessagesState):
        messages = state["messages"]
        last_message = messages[-1]
        if last_message.tool_calls:
            return "tools"
        return END

    # Define call_model function
    async def call_model(state: MessagesState):
        messages = state["messages"]
        response = await model_with_tools.ainvoke(messages)
        return {"messages": [response]}

    # Build the graph
    builder = StateGraph(MessagesState)
    builder.add_node("call_model", call_model)
    builder.add_node("tools", tool_node)

    builder.add_edge(START, "call_model")
    builder.add_conditional_edges(
        "call_model",
        should_continue,
    )
    builder.add_edge("tools", "call_model")

    # Compile the graph
    graph = builder.compile()

    # Test the graph
    math_response = await graph.ainvoke(
        {"messages": [{"role": "user", "content": "what's (3 + 5) x 12?"}]}
    )
    weather_response = await graph.ainvoke(
        {"messages": [{"role": "user", "content": "what is the weather in nyc?"}]}
    )
    ```

:::

:::js
`@langchain/mcp-adapters` 包使智能体能够使用在一个或多个 MCP 服务器上定义的工具。

=== "在智能体中"

    ```typescript title="使用在 MCP 服务器上定义的工具的智能体"
    // highlight-next-line
    import { MultiServerMCPClient } from "langchain-mcp-adapters/client";
    import { ChatAnthropic } from "@langchain/langgraph/prebuilt";
    import { createReactAgent } from "@langchain/langgraph/prebuilt";

    // highlight-next-line
    const client = new MultiServerMCPClient({
      math: {
        command: "node",
        // Replace with absolute path to your math_server.js file
        args: ["/path/to/math_server.js"],
        transport: "stdio",
      },
      weather: {
        // Ensure you start your weather server on port 8000
        url: "http://localhost:8000/mcp",
        transport: "streamable_http",
      },
    });

    // highlight-next-line
    const tools = await client.getTools();
    const agent = createReactAgent({
      llm: new ChatAnthropic({ model: "claude-3-7-sonnet-latest" }),
      // highlight-next-line
      tools,
    });

    const mathResponse = await agent.invoke({
      messages: [{ role: "user", content: "what's (3 + 5) x 12?" }],
    });

    const weatherResponse = await agent.invoke({
      messages: [{ role: "user", content: "what is the weather in nyc?" }],
    });
    ```

=== "在工作流中"

    ```typescript
    import { MultiServerMCPClient } from "langchain-mcp-adapters/client";
    import { StateGraph, MessagesZodState, START } from "@langchain/langgraph";
    import { ToolNode } from "@langchain/langgraph/prebuilt";
    import { ChatOpenAI } from "@langchain/openai";
    import { AIMessage } from "@langchain/core/messages";
    import { z } from "zod";

    const model = new ChatOpenAI({ model: "gpt-4" });

    const client = new MultiServerMCPClient({
      math: {
        command: "node",
        // Make sure to update to the full absolute path to your math_server.js file
        args: ["./examples/math_server.js"],
        transport: "stdio",
      },
      weather: {
        // make sure you start your weather server on port 8000
        url: "http://localhost:8000/mcp/",
        transport: "streamable_http",
      },
    });

    const tools = await client.getTools();

    const builder = new StateGraph(MessagesZodState)
      .addNode("callModel", async (state) => {
        const response = await model.bindTools(tools).invoke(state.messages);
        return { messages: [response] };
      })
      .addNode("tools", new ToolNode(tools))
      .addEdge(START, "callModel")
      .addConditionalEdges("callModel", (state) => {
        const lastMessage = state.messages.at(-1) as AIMessage | undefined;
        if (!lastMessage?.tool_calls?.length) {
          return "__end__";
        }
        return "tools";
      })
      .addEdge("tools", "callModel");

    const graph = builder.compile();

    const mathResponse = await graph.invoke({
      messages: [{ role: "user", content: "what's (3 + 5) x 12?" }],
    });

    const weatherResponse = await graph.invoke({
      messages: [{ role: "user", content: "what is the weather in nyc?" }],
    });
    ```

:::

## 自定义 MCP 服务器

:::python
要创建您自己的 MCP 服务器，您可以使用 `mcp` 库。这个库提供了一种简单的方式来定义工具并将它们作为服务器运行。

安装 MCP 库：

```bash
pip install mcp
```

:::

:::js
要创建您自己的 MCP 服务器，您可以使用 `@modelcontextprotocol/sdk` 库。这个库提供了一种简单的方式来定义工具并将它们作为服务器运行。

安装 MCP SDK：

```bash
npm install @modelcontextprotocol/sdk
```

:::

使用以下参考实现来测试您的智能体与 MCP 工具服务器。

:::python

```python title="示例数学服务器（stdio 传输）"
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Math")

@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

@mcp.tool()
def multiply(a: int, b: int) -> int:
    """Multiply two numbers"""
    return a * b

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

:::

:::js

```typescript title="示例数学服务器（stdio 传输）"
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "math-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add",
        description: "Add two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
      },
      {
        name: "multiply",
        description: "Multiply two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "add": {
      const { a, b } = request.params.arguments as { a: number; b: number };
      return {
        content: [
          {
            type: "text",
            text: String(a + b),
          },
        ],
      };
    }
    case "multiply": {
      const { a, b } = request.params.arguments as { a: number; b: number };
      return {
        content: [
          {
            type: "text",
            text: String(a * b),
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Math MCP server running on stdio");
}

main();
```

:::

:::python

```python title="示例天气服务器（可流式 HTTP 传输）"
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Weather")

@mcp.tool()
async def get_weather(location: str) -> str:
    """Get weather for location."""
    return "It's always sunny in New York"

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
```

:::

:::js

```typescript title="示例天气服务器（HTTP 传输）"
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

const app = express();
app.use(express.json());

const server = new Server(
  {
    name: "weather-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_weather",
        description: "Get weather for location",
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "Location to get weather for",
            },
          },
          required: ["location"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "get_weather": {
      const { location } = request.params.arguments as { location: string };
      return {
        content: [
          {
            type: "text",
            text: `It's always sunny in ${location}`,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

app.post("/mcp", async (req, res) => {
  const transport = new SSEServerTransport("/mcp", res);
  await server.connect(transport);
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Weather MCP server running on port ${PORT}`);
});
```

:::

:::python

## 其他资源

- [MCP 文档](https://modelcontextprotocol.io/introduction)
- [MCP 传输文档](https://modelcontextprotocol.io/docs/concepts/transports)
- [langchain_mcp_adapters](https://github.com/langchain-ai/langchain-mcp-adapters)
  :::

:::js

## 其他资源

- [MCP 文档](https://modelcontextprotocol.io/introduction)
- [MCP 传输文档](https://modelcontextprotocol.io/docs/concepts/transports)
- [`@langchain/mcp-adapters`](https://npmjs.com/package/@langchain/mcp-adapters)
  :::
