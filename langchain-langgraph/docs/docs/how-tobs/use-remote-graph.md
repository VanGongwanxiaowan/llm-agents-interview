# 如何使用 RemoteGraph 与部署交互

!!! info "先决条件"

    - [LangGraph 平台](../concepts/langgraph_platform.md)
    - [LangGraph 服务器](../concepts/langgraph_server.md)

`RemoteGraph` 是一个接口，允许您像与常规的本地定义的 LangGraph 图（例如 `CompiledGraph`）一样与您的 LangGraph 平台部署进行交互。本指南将向您展示如何初始化 `RemoteGraph` 并与其交互。

## 初始化图

:::python

初始化 `RemoteGraph` 时，您必须始终指定：

- `name`：您想要交互的图的名称。这与您在部署的 `langgraph.json` 配置文件中使用的图名称相同。
- `api_key`：有效的 LangSmith API 密钥。可以设置为环境变量（`LANGSMITH_API_KEY`）或通过 `api_key` 参数直接传递。如果 `LangGraphClient` / `SyncLangGraphClient` 使用 `api_key` 参数初始化，API 密钥也可以通过 `client` / `sync_client` 参数提供。

此外，您必须提供以下之一：

- `url`：您想要交互的部署的 URL。如果您传递 `url` 参数，将使用提供的 URL、头部（如果提供）和默认配置值（例如超时等）创建同步和异步客户端。
- `client`：用于与部署异步交互的 `LangGraphClient` 实例（例如使用 `.astream()`、`.ainvoke()`、`.aget_state()`、`.aupdate_state()` 等）
- `sync_client`：用于与部署同步交互的 `SyncLangGraphClient` 实例（例如使用 `.stream()`、`.invoke()`、`.get_state()`、`.update_state()` 等）

!!! Note

    如果您同时传递 `client` 或 `sync_client` 以及 `url` 参数，它们将优先于 `url` 参数。如果没有提供 `client` / `sync_client` / `url` 参数中的任何一个，`RemoteGraph` 将在运行时引发 `ValueError`。

:::

:::js

初始化 `RemoteGraph` 时，您必须始终指定：

- `name`：您想要交互的图的名称。这与您在部署的 `langgraph.json` 配置文件中使用的图名称相同。
- `apiKey`：有效的 LangSmith API 密钥。可以设置为环境变量（`LANGSMITH_API_KEY`）或通过 `apiKey` 参数直接传递。如果 `LangGraphClient` 使用 `apiKey` 参数初始化，API 密钥也可以通过 `client` 提供。

此外，您必须提供以下之一：

- `url`：您想要交互的部署的 URL。如果您传递 `url` 参数，将使用提供的 URL、头部（如果提供）和默认配置值（例如超时等）创建同步和异步客户端。
- `client`：用于与部署异步交互的 `LangGraphClient` 实例

:::

### 使用 URL

:::python

```python
from langgraph.pregel.remote import RemoteGraph

url = <DEPLOYMENT_URL>
graph_name = "agent"
remote_graph = RemoteGraph(graph_name, url=url)
```

:::

:::js

```ts
import { RemoteGraph } from "@langchain/langgraph/remote";

const url = `<DEPLOYMENT_URL>`;
const graphName = "agent";
const remoteGraph = new RemoteGraph({ graphId: graphName, url });
```

:::

### 使用客户端

:::python

```python
from langgraph_sdk import get_client, get_sync_client
from langgraph.pregel.remote import RemoteGraph

url = <DEPLOYMENT_URL>
graph_name = "agent"
client = get_client(url=url)
sync_client = get_sync_client(url=url)
remote_graph = RemoteGraph(graph_name, client=client, sync_client=sync_client)
```

:::

:::js

```ts
import { Client } from "@langchain/langgraph-sdk";
import { RemoteGraph } from "@langchain/langgraph/remote";

const client = new Client({ apiUrl: `<DEPLOYMENT_URL>` });
const graphName = "agent";
const remoteGraph = new RemoteGraph({ graphId: graphName, client });
```

:::

## 调用图

:::python
由于 `RemoteGraph` 是一个实现了与 `CompiledGraph` 相同方法的 `Runnable`，您可以像通常与编译图交互一样与其交互，即通过调用 `.invoke()`、`.stream()`、`.get_state()`、`.update_state()` 等方法（以及它们的异步对应方法）。

### 异步调用

!!! Note

    要异步使用图，您必须在初始化 `RemoteGraph` 时提供 `url` 或 `client`。

```python
# 调用图
result = await remote_graph.ainvoke({
    "messages": [{"role": "user", "content": "what's the weather in sf"}]
})

# 从图流式传输输出
async for chunk in remote_graph.astream({
    "messages": [{"role": "user", "content": "what's the weather in la"}]
}):
    print(chunk)
```

### 同步调用

!!! Note

    要同步使用图，您必须在初始化 `RemoteGraph` 时提供 `url` 或 `sync_client`。

```python
# 调用图
result = remote_graph.invoke({
    "messages": [{"role": "user", "content": "what's the weather in sf"}]
})

# 从图流式传输输出
for chunk in remote_graph.stream({
    "messages": [{"role": "user", "content": "what's the weather in la"}]
}):
    print(chunk)
```

:::

:::js
由于 `RemoteGraph` 是一个实现了与 `CompiledGraph` 相同方法的 `Runnable`，您可以像通常与编译图交互一样与其交互，即通过调用 `.invoke()`、`.stream()`、`.getState()`、`.updateState()` 等方法。

```ts
// 调用图
const result = await remoteGraph.invoke({
    messages: [{role: "user", content: "what's the weather in sf"}]
})

// 从图流式传输输出
for await (const chunk of await remoteGraph.stream({
    messages: [{role: "user", content: "what's the weather in la"}]
})):
    console.log(chunk)
```

:::

## 线程级持久性

默认情况下，图运行（即 `.invoke()` 或 `.stream()` 调用）是无状态的 - 图的检查点和最终状态不会被持久化。如果您希望持久化图运行的输出（例如，启用人机交互功能），您可以创建一个线程并通过 `config` 参数提供线程 ID，就像您对常规编译图所做的那样：

:::python

```python
from langgraph_sdk import get_sync_client
url = <DEPLOYMENT_URL>
graph_name = "agent"
sync_client = get_sync_client(url=url)
remote_graph = RemoteGraph(graph_name, url=url)

# 创建线程（或使用现有线程）
thread = sync_client.threads.create()

# 使用线程配置调用图
config = {"configurable": {"thread_id": thread["thread_id"]}}
result = remote_graph.invoke({
    "messages": [{"role": "user", "content": "what's the weather in sf"}]
}, config=config)

# 验证状态已持久化到线程
thread_state = remote_graph.get_state(config)
print(thread_state)
```

:::

:::js

```ts
import { Client } from "@langchain/langgraph-sdk";
import { RemoteGraph } from "@langchain/langgraph/remote";

const url = `<DEPLOYMENT_URL>`;
const graphName = "agent";
const client = new Client({ apiUrl: url });
const remoteGraph = new RemoteGraph({ graphId: graphName, url });

// 创建线程（或使用现有线程）
const thread = await client.threads.create();

// 使用线程配置调用图
const config = { configurable: { thread_id: thread.thread_id } };
const result = await remoteGraph.invoke(
  {
    messages: [{ role: "user", content: "what's the weather in sf" }],
  },
  config
);

// 验证状态已持久化到线程
const threadState = await remoteGraph.getState(config);
console.log(threadState);
```

:::

## 用作子图

!!! Note

    如果您需要在具有 `RemoteGraph` 子图节点的图中使用 `checkpointer`，请确保使用 UUID 作为线程 ID。

由于 `RemoteGraph` 的行为与常规 `CompiledGraph` 相同，它也可以用作另一个图中的子图。例如：

:::python

```python
from langgraph_sdk import get_sync_client
from langgraph.graph import StateGraph, MessagesState, START
from typing import TypedDict

url = <DEPLOYMENT_URL>
graph_name = "agent"
remote_graph = RemoteGraph(graph_name, url=url)

# 定义父图
builder = StateGraph(MessagesState)
# 直接将远程图添加为节点
builder.add_node("child", remote_graph)
builder.add_edge(START, "child")
graph = builder.compile()

# 调用父图
result = graph.invoke({
    "messages": [{"role": "user", "content": "what's the weather in sf"}]
})
print(result)

# 从父图和子图流式传输输出
for chunk in graph.stream({
    "messages": [{"role": "user", "content": "what's the weather in sf"}]
}, subgraphs=True):
    print(chunk)
```

:::

:::js

```ts
import { MessagesAnnotation, StateGraph, START } from "@langchain/langgraph";
import { RemoteGraph } from "@langchain/langgraph/remote";

const url = `<DEPLOYMENT_URL>`;
const graphName = "agent";
const remoteGraph = new RemoteGraph({ graphId: graphName, url });

// 定义父图并直接将远程图添加为节点
const graph = new StateGraph(MessagesAnnotation)
  .addNode("child", remoteGraph)
  .addEdge(START, "child")
  .compile();

// 调用父图
const result = await graph.invoke({
  messages: [{ role: "user", content: "what's the weather in sf" }],
});
console.log(result);

// 从父图和子图流式传输输出
for await (const chunk of await graph.stream(
  {
    messages: [{ role: "user", content: "what's the weather in la" }],
  },
  { subgraphs: true }
)) {
  console.log(chunk);
}
```

:::
