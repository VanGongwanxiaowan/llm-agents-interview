---
search:
  boost: 2
tags:
  - agent
hide:
  - tags
---

# 用户界面

您可以使用预构建的聊天界面通过 [Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui) 与任何 LangGraph 智能体进行交互。使用[部署版本](https://agentchat.vercel.app)是最快的开始方式，允许您与本地和已部署的图进行交互。

## 在界面中运行智能体

首先，[本地](../tutorials/langgraph-platform/local-server.md)设置 LangGraph API 服务器或在 [LangGraph Platform](https://langchain-ai.github.io/langgraph/cloud/quick_start/) 上部署您的智能体。

然后，导航到 [Agent Chat UI](https://agentchat.vercel.app)，或者克隆仓库并[在本地运行开发服务器](https://github.com/langchain-ai/agent-chat-ui?tab=readme-ov-file#setup)：

<video controls src="../assets/base-chat-ui.mp4" type="video/mp4"></video>

!!! 提示

    界面开箱即用地支持渲染工具调用和工具结果消息。要自定义显示哪些消息，请参阅 Agent Chat UI 文档中的[隐藏聊天消息](https://github.com/langchain-ai/agent-chat-ui?tab=readme-ov-file#hiding-messages-in-the-chat)部分。

## 添加人工干预

Agent Chat UI 完全支持[人工干预](../concepts/human_in_the_loop.md)工作流。要试用此功能，请将 `src/agent/graph.py` 中的智能体代码（来自[部署](../tutorials/langgraph-platform/local-server.md)指南）替换为这个[智能体实现](../how-tos/human_in_the_loop/add-human-in-the-loop.md#add-interrupts-to-any-tool)：

<video controls src="../assets/interrupt-chat-ui.mp4" type="video/mp4"></video>

!!! 重要

    如果您的 LangGraph 智能体使用 @[`HumanInterrupt` 模式][HumanInterrupt] 进行中断，Agent Chat UI 将工作得最好。如果您不使用该模式，Agent Chat UI 将能够渲染传递给 `interrupt` 函数的输入，但不会完全支持恢复您的图。

## 生成式界面

您也可以在 Agent Chat UI 中使用生成式界面。

生成式界面允许您定义 [React](https://react.dev/) 组件，并将它们从 LangGraph 服务器推送到界面。有关构建生成式界面 LangGraph 智能体的更多文档，请阅读[这些文档](https://langchain-ai.github.io/langgraph/cloud/how-tos/generative_ui_react/)。
