# 指南

本部分的页面为以下主题提供概念概述和操作指南：

## 智能体开发

- [概述](../agents/overview.md)：使用预构建组件构建智能体。
- [运行智能体](../agents/run_agents.md)：通过提供输入、解释输出、启用流式处理和控制执行限制来运行智能体。

## LangGraph API

- [图 API](../concepts/low_level.md)：使用图 API 通过图范式定义工作流。
- [函数式 API](../concepts/functional_api.md)：使用函数式 API 通过函数范式构建工作流，无需考虑图结构。
- [运行时](../concepts/pregel.md)：Pregel 实现 LangGraph 的运行时，管理 LangGraph 应用程序的执行。

## 核心功能

这些功能在 LangGraph OSS 和 LangGraph Platform 中都可用。

- [流式处理](../concepts/streaming.md)：从 LangGraph 图流式传输输出。
- [持久化](../concepts/persistence.md)：持久化 LangGraph 图的状态。
- [持久执行](../concepts/durable_execution.md)：在图执行的关键点保存进度。
- [记忆](../concepts/memory.md)：记住有关先前交互的信息。
- [上下文](../agents/context.md)：将外部数据传递给 LangGraph 图以为图执行提供上下文。
- [模型](../agents/models.md)：将各种 LLM 集成到您的 LangGraph 应用程序中。
- [工具](../concepts/tools.md)：直接与外部系统接口。
- [人在回路](../concepts/human_in_the_loop.md)：暂停图并在工作流的任何点等待人工输入。
- [时间旅行](../concepts/time-travel.md)：回到 LangGraph 图执行中的特定时间点。
- [子图](../concepts/subgraphs.md)：构建模块化图。
- [多智能体](../concepts/multi_agent.md)：将复杂工作流分解为多个智能体。
- [MCP](../concepts/mcp.md)：在 LangGraph 图中使用 MCP 服务器。
- [评估](../agents/evals.md)：使用 LangSmith 评估您的图性能。

