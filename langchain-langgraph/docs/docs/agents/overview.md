---
title: 概览
search:
  boost: 2
tags:
  - agent
hide:
  - tags
---

# 使用预构建组件开发智能体

LangGraph 提供了低级别原语和高级预构建组件，用于构建基于智能体的应用程序。本节重点介绍预构建的即用型组件，旨在帮助您快速可靠地构建智能体系统——无需从头实现编排、记忆或人工反馈处理。

## 什么是智能体？

智能体由三个组件组成：**大语言模型 (LLM)**、一组可使用的**工具**，以及提供指令的**提示词**。

LLM 在循环中运行。在每次迭代中，它选择一个要调用的工具，提供输入，接收结果（观察），并使用该观察来指导下一个动作。循环继续进行，直到满足停止条件——通常是当智能体收集到足够的信息来响应用户时。

<figure markdown="1">
![image](./assets/agent.png){: style="max-height:400px"}
<figcaption>智能体循环：LLM 选择工具并使用其输出来完成用户请求。</figcaption>
</figure>

## 核心特性

LangGraph 包含构建健壮的生产就绪智能体系统所必需的几项能力：

- [**记忆集成**](../how-tos/memory/add-memory.md)：原生支持_短期_（基于会话）和_长期_（跨会话持久化）记忆，使聊天机器人和助手具备有状态行为。
- [**人机协作控制**](../concepts/human_in_the_loop.md)：执行可以_无限期_暂停以等待人工反馈——与仅限于实时交互的基于 WebSocket 的解决方案不同。这允许在工作流的任何点进行异步批准、纠正或干预。
- [**流式支持**](../how-tos/streaming.md)：智能体状态、模型令牌、工具输出或组合流的实时流式传输。
- [**部署工具**](../tutorials/langgraph-platform/local-server.md)：包括无基础设施部署工具。[**LangGraph 平台**](https://langchain-ai.github.io/langgraph/concepts/langgraph_platform/) 支持测试、调试和部署。
  - **[Studio](https://langchain-ai.github.io/langgraph/concepts/langgraph_studio/)**：用于检查和调试工作流的可视化 IDE。
  - 支持多种[**部署选项**](https://langchain-ai.github.io/langgraph/concepts/deployment_options.md)用于生产环境。

## 高级构建块

LangGraph 附带一组实现常见智能体行为和工作流的预构建组件。这些抽象建立在 LangGraph 框架之上，提供更快的生产路径，同时保持高级自定义的灵活性。

使用 LangGraph 进行智能体开发可以让您专注于应用程序的逻辑和行为，而不是构建和维护状态、记忆和人工反馈的支持基础设施。

:::python

## 包生态系统

高级组件组织到几个包中，每个包都有特定的焦点。

| 包                                         | 描述                                                                                     | 安装命令                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| `langgraph-prebuilt` (langgraph 的一部分) | 用于[**创建智能体**](./agents.md)的预构建组件                                              | `pip install -U langgraph langchain`    |
| `langgraph-supervisor`                     | 用于构建[**监督者**](./multi-agent.md#supervisor)智能体的工具                              | `pip install -U langgraph-supervisor`   |
| `langgraph-swarm`                          | 用于构建[**群体**](./multi-agent.md#swarm)多智能体系统的工具                               | `pip install -U langgraph-swarm`        |
| `langchain-mcp-adapters`                   | 用于工具和资源集成的[**MCP 服务器**](./mcp.md)接口                                          | `pip install -U langchain-mcp-adapters` |
| `langmem`                                  | 智能体记忆管理：[**短期和长期**](../how-tos/memory/add-memory.md)记忆                        | `pip install -U langmem`                |
| `agentevals`                               | 用于[**评估智能体性能**](./evals.md)的工具                                                 | `pip install -U agentevals`             |

## 可视化智能体图

使用以下工具可视化由
@[`create_react_agent`][create_react_agent]
生成的图并查看相应代码的大纲。
它允许您探索智能体的基础设施，该基础设施由以下组件的存在定义：

- [`tools`](../how-tos/tool-calling.md)：智能体可用于执行任务的工具列表（函数、API 或其他可调用对象）。
- [`pre_model_hook`](../how-tos/create-react-agent-manage-message-history.ipynb)：在调用模型之前调用的函数。它可用于压缩消息或执行其他预处理任务。
- `post_model_hook`：在调用模型后调用的函数。它可用于实现护栏、人机协作流程或其他后处理任务。
- [`response_format`](../agents/agents.md#6-configure-structured-output)：用于约束最终输出类型的数据结构，例如 `pydantic` 的 `BaseModel`。

<div class="agent-layout">
  <div class="agent-graph-features-container">
    <div class="agent-graph-features">
      <h3 class="agent-section-title">特性</h3>
      <label><input type="checkbox" id="tools" checked> <code>tools</code></label>
      <label><input type="checkbox" id="pre_model_hook"> <code>pre_model_hook</code></label>
      <label><input type="checkbox" id="post_model_hook"> <code>post_model_hook</code></label>
      <label><input type="checkbox" id="response_format"> <code>response_format</code></label>
    </div>
  </div>

  <div class="agent-graph-container">
    <h3 class="agent-section-title">图</h3>
    <img id="agent-graph-img" src="../assets/react_agent_graphs/0001.svg" alt="graph image" style="max-width: 100%;"/>
  </div>
</div>

以下代码片段显示了如何使用
@[`create_react_agent`][create_react_agent]
创建上述智能体（和底层图）：

<div class="language-python">
  <pre><code id="agent-code" class="language-python"></code></pre>
</div>

<script>
function getCheckedValue(id) {
  return document.getElementById(id).checked ? "1" : "0";
}

function getKey() {
  return [
    getCheckedValue("response_format"),
    getCheckedValue("post_model_hook"),
    getCheckedValue("pre_model_hook"),
    getCheckedValue("tools")
  ].join("");
}

function generateCodeSnippet({ tools, pre, post, response }) {
  const lines = [
    "from langgraph.prebuilt import create_react_agent",
    "from langchain_openai import ChatOpenAI"
  ];

  if (response) lines.push("from pydantic import BaseModel");

  lines.push("", 'model = ChatOpenAI("o4-mini")', "");

  if (tools) {
    lines.push(
      "def tool() -> None:",
      '    """测试工具。"""',
      "    ...",
      ""
    );
  }

  if (pre) {
    lines.push(
      "def pre_model_hook() -> None:",
      '    """预模型钩子。"""',
      "    ...",
      ""
    );
  }

  if (post) {
    lines.push(
      "def post_model_hook() -> None:",
      '    """后模型钩子。"""',
      "    ...",
      ""
    );
  }

  if (response) {
    lines.push(
      "class ResponseFormat(BaseModel):",
      '    """智能体的响应格式。"""',
      "    result: str",
      ""
    );
  }

  lines.push("agent = create_react_agent(");
  lines.push("    model,");

  if (tools) lines.push("    tools=[tool],");
  if (pre) lines.push("    pre_model_hook=pre_model_hook,");
  if (post) lines.push("    post_model_hook=post_model_hook,");
  if (response) lines.push("    response_format=ResponseFormat,");

  lines.push(")", "", "# 可视化图", "# 对于 Jupyter 或 GUI 环境:", "agent.get_graph().draw_mermaid_png()", "", "# 保存 PNG 到文件:", "png_data = agent.get_graph().draw_mermaid_png()", "with open(\"graph.png\", \"wb\") as f:", "    f.write(png_data)", "", "# 对于终端/ASCII 输出:", "agent.get_graph().draw_ascii()");

  return lines.join("\n");
}

async function render() {
  const key = getKey();
  document.getElementById("agent-graph-img").src = `../assets/react_agent_graphs/${key}.svg`;

  const state = {
    tools: document.getElementById("tools").checked,
    pre: document.getElementById("pre_model_hook").checked,
    post: document.getElementById("post_model_hook").checked,
    response: document.getElementById("response_format").checked
  };

  document.getElementById("agent-code").textContent = generateCodeSnippet(state);
}

function initializeWidget() {
  render(); // no need for `await` here
  document.querySelectorAll(".agent-graph-features input").forEach((input) => {
    input.addEventListener("change", render);
  });
}

// Init for both full reload and SPA nav (used by MkDocs Material)
window.addEventListener("DOMContentLoaded", initializeWidget);
document$.subscribe(initializeWidget);
</script>

:::

:::js

## 包生态系统

高级组件组织到几个包中，每个包都有特定的焦点。

| 包                        | 描述                                                                         | 安装命令                                             |
| ------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `langgraph`              | 用于[**创建智能体**](./agents.md)的预构建组件                                  | `npm install @langchain/langgraph @langchain/core` |
| `langgraph-supervisor`   | 用于构建[**监督者**](./multi-agent.md#supervisor)智能体的工具                   | `npm install @langchain/langgraph-supervisor`      |
| `langgraph-swarm`        | 用于构建[**群体**](./multi-agent.md#swarm)多智能体系统的工具                    | `npm install @langchain/langgraph-swarm`           |
| `langchain-mcp-adapters` | 用于工具和资源集成的[**MCP 服务器**](./mcp.md)接口                             | `npm install @langchain/mcp-adapters`              |
| `agentevals`             | 用于[**评估智能体性能**](./evals.md)的工具                                     | `npm install agentevals`                           |

## 可视化智能体图

使用以下工具可视化由 @[`createReactAgent`][create_react_agent] 生成的图并查看相应代码的大纲。它允许您探索智能体的基础设施，该基础设施由以下组件的存在定义：

- [`tools`](./tools.md)：智能体可用于执行任务的工具列表（函数、API 或其他可调用对象）。
- `preModelHook`：在调用模型之前调用的函数。它可用于压缩消息或执行其他预处理任务。
- `postModelHook`：在调用模型后调用的函数。它可用于实现护栏、人机协作流程或其他后处理任务。
- [`responseFormat`](./agents.md#6-configure-structured-output)：用于约束最终输出类型的数据结构（通过 Zod 模式）。

<div class="agent-layout">
  <div class="agent-graph-features-container">
    <div class="agent-graph-features">
      <h3 class="agent-section-title">特性</h3>
      <label><input type="checkbox" id="tools" checked> <code>tools</code></label>
      <label><input type="checkbox" id="preModelHook"> <code>preModelHook</code></label>
      <label><input type="checkbox" id="postModelHook"> <code>postModelHook</code></label>
      <label><input type="checkbox" id="responseFormat"> <code>responseFormat</code></label>
    </div>
  </div>

  <div class="agent-graph-container">
    <h3 class="agent-section-title">图</h3>
    <img id="agent-graph-img" src="../assets/react_agent_graphs/0001.svg" alt="graph image" style="max-width: 100%;"/>
  </div>
</div>

以下代码片段显示了如何使用 @[`createReactAgent`][create_react_agent] 创建上述智能体（和底层图）：

<div class="language-typescript">
  <pre><code id="agent-code" class="language-typescript"></code></pre>
</div>

<script>
function getCheckedValue(id) {
  return document.getElementById(id).checked ? "1" : "0";
}

function getKey() {
  return [
    getCheckedValue("responseFormat"),
    getCheckedValue("postModelHook"),
    getCheckedValue("preModelHook"),
    getCheckedValue("tools")
  ].join("");
}

function dedent(strings, ...values) {
  const str = String.raw({ raw: strings }, ...values)
  const [space] = str.split("\n").filter(Boolean).at(0).match(/^(\s*)/)
  const spaceLen = space.length
  return str.split("\n").map(line => line.slice(spaceLen)).join("\n").trim()
}

Object.assign(dedent, {
  offset: (size) => (strings, ...values) => {
    return dedent(strings, ...values).split("\n").map(line => " ".repeat(size) + line).join("\n")
  }
})




function generateCodeSnippet({ tools, pre, post, response }) {
  const lines = []

  lines.push(dedent`
    import { createReactAgent } from "@langchain/langgraph/prebuilt";
    import { ChatOpenAI } from "@langchain/openai";
  `)

  if (tools) lines.push(`import { tool } from "@langchain/core/tools";`);  
  if (response || tools) lines.push(`import { z } from "zod";`);

  lines.push("", dedent`
    const agent = createReactAgent({
      llm: new ChatOpenAI({ model: "o4-mini" }),
  `)

  if (tools) {
    lines.push(dedent.offset(2)`
      tools: [
        tool(() => "Sample tool output", {
          name: "sampleTool",
          schema: z.object({}),
        }),
      ],
    `)
  }

  if (pre) {
    lines.push(dedent.offset(2)`
      preModelHook: (state) => ({ llmInputMessages: state.messages }),
    `)
  }

  if (post) {
    lines.push(dedent.offset(2)`
      postModelHook: (state) => state,
    `)
  }

  if (response) {
    lines.push(dedent.offset(2)`
      responseFormat: z.object({ result: z.string() }),
    `)
  }

  lines.push(`});`);

  return lines.join("\n");
}

function render() {
  const key = getKey();
  document.getElementById("agent-graph-img").src = `../assets/react_agent_graphs/${key}.svg`;

  const state = {
    tools: document.getElementById("tools").checked,
    pre: document.getElementById("preModelHook").checked,
    post: document.getElementById("postModelHook").checked,
    response: document.getElementById("responseFormat").checked
  };

  document.getElementById("agent-code").textContent = generateCodeSnippet(state);
}

function initializeWidget() {
  render(); // no need for `await` here
  document.querySelectorAll(".agent-graph-features input").forEach((input) => {
    input.addEventListener("change", render);
  });
}

// Init for both full reload and SPA nav (used by MkDocs Material)
window.addEventListener("DOMContentLoaded", initializeWidget);
document$.subscribe(initializeWidget);
</script>

:::
