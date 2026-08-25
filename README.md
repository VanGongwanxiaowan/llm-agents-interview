# llm-agents-interview

> 大模型（LLM）与 AI Agent 面试 / 学习知识库，覆盖 Transformer 原理、后训练、RAG、上下文工程、Agent 设计与评估、多智能体协作等主题。

仓库地址：https://github.com/GongLingRui/llm-agents-interview

---

## 仓库总览

| 目录 | 主题 | 文档数 |
|------|------|--------|
| [ai-agent-notes/](ai-agent-notes/) | 《深入理解 AI Agent：设计原理与工程实践》全书读书笔记 | 12 |
| [大模型原理/](大模型原理/) | LLM 原理、分词、解码、RAG、上下文工程、System Prompt | 7 + 1 PDF |
| [大模型原理/文言AI/](大模型原理/文言AI/) | 文言 AI 系列笔记（Transformer / 面试题 / Agent / 后训练） | 39 |
| [大模型面试题/](大模型面试题/) | 大模型面试题分类整理 | 1（持续更新） |
| [参考文章/](参考文章/) | 外部优质文章收录（Agent / RAG / 推理优化 / OpenClaw） | 4 |

---

## 一、ai-agent-notes ——《深入理解 AI Agent》读书笔记

> 作者：李博杰（Pine AI 首席科学家）｜核心公式：**Agent = LLM + 上下文 + 工具**

详细索引见 [ai-agent-notes/README.md](ai-agent-notes/README.md)。

| 文件 | 核心主题 |
|------|----------|
| [00-引言与全书导读](ai-agent-notes/00-引言与全书导读.md) | 核心公式、两大部分、配套资源 |
| [01-AI-Agent入门](ai-agent-notes/01-AI-Agent入门.md) | ReAct 循环、Harness 五要素、五大设计模式 |
| [02-上下文工程](ai-agent-notes/02-上下文工程.md) | API 上下文结构、KV Cache、提示工程、Skills、上下文压缩 |
| [03-用户记忆和知识库](ai-agent-notes/03-用户记忆和知识库.md) | 用户记忆系统、RAG 技术栈、结构化索引、智能体化 RAG |
| [04-工具](ai-agent-notes/04-工具.md) | 五类工具、设计原则、MCP、感知/执行/协作工具 |
| [05-Coding-Agent与通用Agent](ai-agent-notes/05-Coding-Agent与通用Agent.md) | 七个核心工具、Harness 工程、故障恢复、代码作为元能力 |
| [06-交互](ai-agent-notes/06-交互.md) | 异步事件驱动、语音、Computer Use、机器人操作 |
| [07-Agent的评估](ai-agent-notes/07-Agent的评估.md) | 评估指标体系、评估环境、LLM-as-a-Judge、失败归因 |
| [08-模型后训练](ai-agent-notes/08-模型后训练.md) | 四阶段全景、SFT/RL、奖励设计、蒸馏、后训练实践 |
| [09-Agent的持续进化](ai-agent-notes/09-Agent的持续进化.md) | 学习信号、四种进化方法、双循环、安全边界、睡眠学习 |
| [10-多Agent协作](ai-agent-notes/10-多Agent协作.md) | 分类框架、协作拓扑、失败模式、Agent 社会 |
| [11-后记与全书核心总结](ai-agent-notes/11-后记与全书核心总结.md) | 两朵乌云、模型与 Agent 共同演进、五大设计模式、三层护栏 |

---

## 二、大模型原理

### 2.1 根目录文档

| 文件 | 主题 |
|------|------|
| [LLM与Agent技术知识汇总.md](大模型原理/LLM与Agent技术知识汇总.md) | 马东锡 NLP 100 篇技术文章结构化汇总 |
| [RAG知识汇总-全量.md](大模型原理/RAG知识汇总-全量.md) | RAG 目录全部 Markdown 合并版 |
| [上下文工程-全量合并.md](大模型原理/上下文工程-全量合并.md) | 上下文工程目录全部笔记合并版 |
| [分词方法总结.md](大模型原理/分词方法总结.md) | LLM 中的 Tokenizers 分词器总结 |
| [分词所有方法总结.pdf](大模型原理/分词所有方法总结.pdf) | 分词方法总结 PDF 版 |
| [大模型解码策略.md](大模型原理/大模型解码策略.md) | 大模型解码策略图解 |
| [systempromptloomi.md](大模型原理/systempromptloomi.md) | loomi 小红书研究 Agent 的 System Prompt |

### 2.2 文言AI 系列

#### 2.2.1 Transformer 篇 —— [目录](大模型原理/文言AI/transformer篇/)

| 文件 | 主题 |
|------|------|
| [1.基础结构](大模型原理/文言AI/transformer篇/1.基础结构.md) | Transformer 整体结构 |
| [2.输入部分具体构成](大模型原理/文言AI/transformer篇/2.输入部分具体构成.md) | 输入 embedding 与位置编码 |
| [3.Self-Attention是怎么执行](大模型原理/文言AI/transformer篇/3.Self-Attention是怎么执行.md) | Self-Attention 执行流程 |
| [4.Multi-HeadAttention](大模型原理/文言AI/transformer篇/4.Multi-HeadAttention.md) | 多头注意力机制 |
| [5.Encoder结构](大模型原理/文言AI/transformer篇/5.Encoder结构.md) | Encoder 结构详解 |
| [6.Decoder结构](大模型原理/文言AI/transformer篇/6.Decoder结构.md) | Decoder 结构详解 |
| [7.第二个Multi-HEadAttention](大模型原理/文言AI/transformer篇/7.第二个Multi-HEadAttention.md) | Decoder 中第二个 Multi-Head Attention |
| [8.Decoder使用TF并行化训练](大模型原理/文言AI/transformer篇/8.Decoder使用TF并行化训练.md) | Decoder 并行化训练 |

#### 2.2.2 大模型基础面试题 —— [目录](大模型原理/文言AI/大模型基础面试题/)

| 文件 | 主题 |
|------|------|
| [1.基础介绍](大模型原理/文言AI/大模型基础面试题/1.基础介绍.md) | LLM 基础介绍 |
| [2.优点和缺点分类](大模型原理/文言AI/大模型基础面试题/2.优点和缺点分类.md) | 大模型优缺点分类 |
| [3.主流的开源模型体系](大模型原理/文言AI/大模型基础面试题/3.主流的开源模型体系.md) | 主流开源模型体系 |
| [4.预训练任务](大模型原理/文言AI/大模型基础面试题/4.预训练任务.md) | 预训练任务 |
| [5.LLM涌现能力](大模型原理/文言AI/大模型基础面试题/5.LLM涌现能力.md) | 涌现能力 |
| [6.ScalingLaw](大模型原理/文言AI/大模型基础面试题/6.ScalingLaw.md) | Scaling Law 缩放定律 |
| [7.幻觉的定义](大模型原理/文言AI/大模型基础面试题/7.幻觉的定义.md) | 幻觉定义 |
| [8.幻觉的评估](大模型原理/文言AI/大模型基础面试题/8.幻觉的评估.md) | 幻觉评估方法 |
| [9.如何缓解幻觉](大模型原理/文言AI/大模型基础面试题/9.如何缓解幻觉.md) | 幻觉缓解策略 |
| [10-Rag定义](大模型原理/文言AI/大模型基础面试题/10-Rag定义.md) | RAG 定义 |
| [11-RAG-基本流程](大模型原理/文言AI/大模型基础面试题/11-RAG-基本流程.md) | RAG 基本流程 |
| [12-RAG-评估](大模型原理/文言AI/大模型基础面试题/12-RAG-评估.md) | RAG 评估 |
| [13-RAG优化策略-上](大模型原理/文言AI/大模型基础面试题/13-RAG优化策略-上.md) | RAG 优化策略（上） |

#### 2.2.3 Agent 系列 —— [目录](大模型原理/文言AI/Agent系列/)

| 文件 | 主题 |
|------|------|
| [1.什么是Agent](大模型原理/文言AI/Agent系列/1.什么是Agent.md) | Agent 定义 |
| [2.Agent和LLM的区别](大模型原理/文言AI/Agent系列/2.Agent和LLM的区别.md) | Agent 与 LLM 的区别 |
| [3.Agent设计框架](大模型原理/文言AI/Agent系列/3.Agent设计框架.md) | Agent 设计框架 |
| [4.Agent-Planing](大模型原理/文言AI/Agent系列/4.Agent-Planing.md) | Agent 规划 |
| [5.Agent-planing评估](大模型原理/文言AI/Agent系列/5.Agent-planing评估.md) | Agent 规划评估 |
| [6.Agent-Memory](大模型原理/文言AI/Agent系列/6.Agent-Memory.md) | Agent 记忆 |
| [7.Agent当中提升memory方法](大模型原理/文言AI/Agent系列/7.Agent当中提升memory方法.md) | 提升 Agent Memory 方法 |
| [8.Memory的评估方法](大模型原理/文言AI/Agent系列/8.Memory的评估方法.md) | Memory 评估方法 |
| [9.Agents-tools工具学习](大模型原理/文言AI/Agent系列/9.Agents-tools工具学习.md) | Agent 工具学习 |
| [10-tools评估](大模型原理/文言AI/Agent系列/10-tools评估.md) | 工具评估 |
| [11.NDCG](大模型原理/文言AI/Agent系列/11.NDCG.md) | NDCG 指标 |
| [12.MCP和A2A](大模型原理/文言AI/Agent系列/12.MCP和A2A.md) | MCP 与 A2A 协议 |
| [13.Agent综合评估](大模型原理/文言AI/Agent系列/13.Agent综合评估.md) | Agent 综合评估 |

#### 2.2.4 后训练 —— [目录](大模型原理/文言AI/后训练/)

| 文件 | 主题 |
|------|------|
| [1.概括](大模型原理/文言AI/后训练/1.概括.md) | 后训练概述 |
| [2.后训练分类](大模型原理/文言AI/后训练/2.后训练分类.md) | 后训练分类 |
| [3.监督微调SFT](大模型原理/文言AI/后训练/3.监督微调SFT.md) | SFT 监督微调 |
| [4.直接偏好优化](大模型原理/文言AI/后训练/4.直接偏好优化.md) | 直接偏好优化 |
| [5.DPO](大模型原理/文言AI/后训练/5.DPO.md) | DPO 算法 |

---

## 三、大模型面试题 —— [目录](大模型面试题/)

### 3.1 语义表达 —— [目录](大模型面试题/语义表达/)

| 文件 | 主题 |
|------|------|
| [1.词向量和语义信息](大模型面试题/语义表达/1.词向量和语义信息.md) | 词向量建模语义信息、稀疏 vs 稠密词向量 |

---

## 四、参考文章 —— [目录](参考文章/)

| 文件 | 主题 |
|------|------|
| [1.md](参考文章/1.md) | OpenClaw 架构深度解析（AI 智能体系统底层工作原理） |
| [agent.md](参考文章/agent.md) | 生产级多智能体系统搭建 / 原型到生产部署实践 |
| [rag.md](参考文章/rag.md) | Is RAG Dead? / Grep vs Embeddings in SWE-Bench |
| [推理优化.md](参考文章/推理优化.md) | LLM 推理优化技术全面分析与生产深度解析 |

---

## 五、外部学习资源

### Agent 框架与工程

- pi 框架（消息变换）：https://zhanghandong.github.io/pi-book/ch05-message-transform.html
- Harness Engineering 讲义：https://walkinglabs.github.io/learn-harness-engineering/zh/lectures/lecture-01-why-capable-agents-still-fail/
- 最简单 Agent：https://learn.shareai.run/zh/
- OpenClaw 文档：https://openclaw-docs.dx3n.cn/
- OpenClaw 入门（Datawhale）：https://datawhalechina.github.io/hello-claw/cn/build/chapter1/
- OpenClaw AI 记忆系统状态机实战：https://openclaw-docs.dx3n.cn/beginner-openclaw-framework-focus/19-AI%E8%AE%B0%E5%BF%86%E7%B3%BB%E7%BB%9F%E7%8A%B6%E6%80%81%E6%9C%BA%E5%AE%9E%E7%8E%B0%E5%AE%9E%E6%88%98
- 马书（大模型理论）：https://lintsinghua.github.io/#ch01

### 强化学习微调

- Predibase 微调指导：https://docs.predibase.com/guides/fine-tuning/overview
- Easy-RL 强化学习教程（未看完部分）：https://datawhalechina.github.io/easy-rl/#/chapter11/chapter11

### 工程备忘

- Spring Cloud 版本兼容性：从 2020 版本起移除 Netflix Ribbon，需使用 Spring Cloud LoadBalancer 支持 Feign 负载均衡。

---

*本仓库用于个人面试与学习整理，持续更新中。*
