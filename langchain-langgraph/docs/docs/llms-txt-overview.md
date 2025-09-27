# llms.txt

下面您可以找到 [`llms.txt`](https://llmstxt.org/) 格式的文档文件列表，特别是 `llms.txt` 和 `llms-full.txt`。这些文件允许大型语言模型 (LLM) 和智能体访问编程文档和 API，在集成开发环境 (IDE) 中特别有用。

| 语言版本 | llms.txt                                                                                                   | llms-full.txt                                                                                                        |
|------------------|------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| LangGraph Python | [https://langchain-ai.github.io/langgraph/llms.txt](https://langchain-ai.github.io/langgraph/llms.txt)     | [https://langchain-ai.github.io/langgraph/llms-full.txt](https://langchain-ai.github.io/langgraph/llms-full.txt)     |
| LangGraph JS     | [https://langchain-ai.github.io/langgraphjs/llms.txt](https://langchain-ai.github.io/langgraphjs/llms.txt) | [https://langchain-ai.github.io/langgraphjs/llms-full.txt](https://langchain-ai.github.io/langgraphjs/llms-full.txt) |
| LangChain Python | [https://python.langchain.com/llms.txt](https://python.langchain.com/llms.txt)                             | N/A                                                                                                                  |
| LangChain JS     | [https://js.langchain.com/llms.txt](https://js.langchain.com/llms.txt)                                     | N/A                                                                                                                  |

!!! info "审查输出"

    即使可以访问最新的文档，当前最先进的模型也可能不总是生成正确的代码。将生成的代码视为起点，在将代码部署到生产环境之前始终进行审查。

## `llms.txt` 和 `llms-full.txt` 之间的区别

- **`llms.txt`** 是一个索引文件，包含带有内容简要描述的链接。LLM 或智能体必须跟随这些链接来访问详细信息。

- **`llms-full.txt`** 直接在单个文件中包含所有详细内容，无需额外导航。

使用 `llms-full.txt` 时的一个关键考虑因素是其大小。对于广泛的文档，此文件可能变得太大而无法放入 LLM 的上下文窗口中。

## 通过 MCP 服务器使用 `llms.txt`

截至 2025 年 3 月 9 日，IDE [还没有对 `llms.txt` 的强大原生支持](https://x.com/jeremyphoward/status/1902109312216129905?t=1eHFv2vdNdAckajnug0_Vw&s=19)。但是，您仍然可以通过 MCP 服务器有效地使用 `llms.txt`。

### 🚀 使用 `mcpdoc` 服务器

我们提供了一个专为 LLM 和 IDE 提供文档服务的 **MCP 服务器**：

👉 **[langchain-ai/mcpdoc GitHub 仓库](https://github.com/langchain-ai/mcpdoc)**

此 MCP 服务器允许将 `llms.txt` 集成到 **Cursor**、**Windsurf**、**Claude** 和 **Claude Code** 等工具中。

📘 **设置说明和使用示例** 可在仓库中找到。

## 使用 `llms-full.txt`

LangGraph `llms-full.txt` 文件通常包含数十万个令牌，超出了大多数 LLM 的上下文窗口限制。要有效使用此文件：

1. **使用 IDE（例如 Cursor、Windsurf）**：
    - 将 `llms-full.txt` 添加为自定义文档。IDE 将自动分块和索引内容，实现检索增强生成 (RAG)。

2. **没有 IDE 支持**：
    - 使用具有大上下文窗口的聊天模型。
    - 实施 RAG 策略来有效管理和查询文档。

