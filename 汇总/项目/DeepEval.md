[开源推荐] DeepEval : 开源 LLM 评估框架，它类似于 Pytest 测试框架，但专注于 LLM 输出的单元测试，支持端到端和组件级评估。

DeepEval 使用本地 LLM 和 NLP 模型来评估输出，涵盖 G-Eval、幻觉检测、答案相关性、RAGAS 等指标。框架适用于 RAG 管道、聊天机器人和 AI Agent 等 AI 应用，支持 LangChain 或 LlamaIndex 等框架。

核心特性
· 评估指标多样：内置20+种现成指标，包括 RAG 相关（答案相关性、忠实度、上下文召回）、Agent 指标（任务完成、工具正确性）、对话指标（知识保留、角色一致性），以及偏见、毒性等安全评估。
· 自定义与扩展：用户可构建自定义指标，并与 DeepEval 生态无缝集成。
· 数据集与基准：自动生成合成数据集，支持在10行代码内对 MMLU、HellaSwag 等流行基准进行 LLM 基准测试。
· 安全与集成：提供红队测试（覆盖40+漏洞，如 SQL 注入），并与 CI/CD 环境兼容；全生命周期集成 Confident AI 平台，用于数据集管理、调试和监控。
· 本地运行：所有评估在用户机器上执行，确保数据隐私。

<img width="900" height="876" alt="image" src="https://github.com/user-attachments/assets/2395f29b-072e-43cd-a389-7617ebd52e33" />

https://x.com/Sumanth_077/status/1973386184559837393

https://github.com/confident-ai/deepeval
