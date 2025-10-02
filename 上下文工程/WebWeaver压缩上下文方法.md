一般让 AI 写长文都是把资料一股脑放到上下文里面，这会导致模型注意力错乱，因为参考的资料太多，上下文太长，模型不可避免会忽略一些重要信息或者被无关信息误导。

WebWeaver 的解法是分而治之，在写作大纲里面放入引用的资料 id，然后让模型一个个章节写，写每个章节的时候都只提供当前这个章节的资料，这样就避免了上下文太长的问题，保护了模型的注意力。

上面的写作过程也是 Agentic 的，不需要硬编码让模型按顺序写，而是直接把整个大纲提供给它，让它自己调用查询资料的工具一步步写出来。这里还有个压缩上下文的技巧是在写最新的章节的时候，把之前的章节的资料都隐藏，只保留写作结果，这样模型既有全局的信息，又能节省上下文。

大纲示例

```
1. Hoehn and Yahr Scale Classifications <citation>id_2, id_6, id_9, id_12, id_13, id_14, id_15, id_17, id_20, id_21</citation>
```

资料查询工具示例

```
{"name": "retrieve", "arguments": {"url_id": ["id_2", "id_6", "id_9", "id_12", "id_13", "id_14", "id_15",
"id_17", "id_20", "id_21"], "goal": "Gather comprehensive information about Hoehn and Yahr scale
classifications and disease staging systems for Parkinson’s disease"}}
```

这种利用查询工具传递 id 的方式来压缩上下文，我在 DeepResearch 的阅读工具里面也用过，主要是用来减少模型生成 url 比较慢的问题，但用在写报告的阶段我确实没想到，对我很有启发。

但这种 Agentic 的方式相比用 Workflow 的方式效果好多少，我是存疑的，因为你让模型自己调用FunctionCall 可能会有幻觉，用代码的方式手动解析大纲然后用 Workflow 的方式可能更可靠。后续我也会做实验对比看看。

<img width="1200" height="636" alt="image" src="https://github.com/user-attachments/assets/8307da2a-27c2-47c6-aff1-03eaa14b3491" />




这篇题为 **《WebWeaver: Structuring Web-Scale Evidence with Dynamic Outlines for Open-Ended Deep Research》** 的论文，提出了一种创新的双智能体框架，致力于让AI能像人类研究员一样进行深度、开放式的调研。

### 📄 官方资料索引

下面的表格汇总了这篇论文的核心信息以及相关的官方资源链接，方便你快速查阅。

| 项目 | 信息 |
| :--- | :--- |
| **论文标题** | WebWeaver: Structuring Web-Scale Evidence with Dynamic Outlines for Open-Ended Deep Research |
| **核心摘要** | 针对开放式深度研究（OEDR）任务，提出了由**规划智能体**和**写作智能体**协同工作的框架，通过动态大纲构建和分层内容合成，解决了传统方法的静态规划与信息过载问题。 |
| **官方PDF链接** | [https://arxiv.org/pdf/2509.13312](https://arxiv.org/pdf/2509.13312)  |
| **GitHub项目地址** | [https://github.com/Alibaba-NLP/DeepResearch](https://github.com/Alibaba-NLP/DeepResearch)  |

### 💡 论文核心解读

为了帮助你快速了解这项工作的价值，这里有一些关键信息：

- **创新点**：WebWeaver的核心创新在于其**双智能体架构**。**规划智能体**负责动态地进行网络探索和优化研究大纲，而**写作智能体**则基于大纲，通过分层检索证据来逐部分撰写报告。这种设计模拟了人类研究员“边探索边规划”的工作方式。
- **解决的问题**：传统AI研究方法常因**静态大纲**和试图**一次性处理所有信息**而遇到瓶颈，导致报告深度不够、遗漏关键信息或产生事实错误（幻觉）。WebWeaver的动态和分层机制有效地应对了这些挑战。
- **性能表现**：根据论文，WebWeaver在DeepResearch Bench、DeepConsult和DeepResearchGym等多个权威评测基准上都取得了领先的成绩。


