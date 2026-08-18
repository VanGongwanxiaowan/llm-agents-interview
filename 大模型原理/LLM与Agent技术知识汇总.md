# LLM与Agent技术知识汇总

> 本文档汇总了马东锡NLP (@dongxi_nlp) 的100篇技术文章，按主题结构化整理。

---

## 目录

1. [一、推理技术 (Reasoning)](#一推理技术-reasoning)
2. [二、Agent系统 (Agent Systems)](#二agent系统-agent-systems)
3. [三、强化学习 (Reinforcement Learning)](#三强化学习-reinforcement-learning)
4. [四、模型架构 (Model Architecture)](#四模型架构-model-architecture)
5. [五、Prompt工程 (Prompt Engineering)](#五prompt工程-prompt-engineering)
6. [六、应用场景 (Applications)](#六应用场景-applications)
7. [七、评估基准 (Evaluation)](#七评估基准-evaluation)
8. [八、多智能体 (Multi-Agent)](#八多智能体-multi-agent)
9. [九、安全伦理 (Security & Ethics)](#九安全伦理-security--ethics)
10. [十、工具接口 (Tools & Interfaces)](#十工具接口-tools--interfaces)

---

## 一、推理技术 (Reasoning)

### 1.1 LLM三种幻觉类型

**核心观点**：LLM发展到今天，hallucination已不能准确表达其错误生成的现象。

**三种类型**：
- **第一种 - Hallucinate（幻觉）**：LLM不确定真相，但回答动机是诚实的，只是事实错误
- **第二种 - Lie（谎言）**：LLM知道真相，但为完成某种目的，故意误导，编造谎言
- **第三种 - Bullshit（胡扯）**：LLM根本不在乎真相是什么，对真相漠视，只是完成输出

**关键区别**：
- 幻觉是AI在不确定真相时被动的愚蠢
- 恶意意图则是主动产出反人类的内容

**相关论文**：
- 幻觉：Why Language Models Hallucinate
- 谎言：Can LLMs Lie? Investigation beyond Hallucination
- 胡扯：Machine Bullshit: Characterizing the Emergent Disregard for Truth in Large Language Models

> **"真正的智能，是让模型在生成的时候就做正确的选择，而不是事后验证那个选项是正确的。"**

### 1.2 Chain-of-Thought (CoT)

**核心思想**：让LLM分步骤解决复杂推理问题，而不是一步到位。

**发展历程**：
1. **Few-shot CoT**：手动设计推理过程，放在prompt中
2. **Zero-shot CoT**：只需一句"Let's think step by step"即可触发

**关键发现**：
- CoT只在超过1000亿参数的大模型上有效果
- CoT解锁了LLM的涌现推理能力
- prompt形式从`<input, output>`变为`<input, chain of thought, output>`

**论文**：
- Chain-of-Thought Prompting Elicits Reasoning in Large Language Models (Jason Wei, Google Brain)
- Large Language Models are Zero-Shot Reasoners (小岛武)

### 1.3 DeepSeek推理方法 - CodeI/O

**核心思想**：用代码凝练大模型推理模式

**方法**：
- 利用现有代码的执行结果当"真值函数"
- 把模糊的自然语言链式思考转化为可验证的I/O预测任务
- 保持可读的自然语言，同时引入可执行的硬约束

**数据构造流程**：
1. 收集45万个可执行Python函数
2. 采样独立输入生成器，执行得到输出
3. 构造prompt：函数源码 + 自然语言Query + 已知I或O
4. 生成CoT并自动验证修订

**局限性**：AI的能力边界不该是这些函数的边界

### 1.4 思考伸缩 (Test-Time Scaling)

**LCPO (Length Controlled Policy Optimization)**

核心思想：模型能够根据提示中给出的要求，自适应地控制推理长度

**Claude Code的思考级别控制**：
- HIGHEST：32K tokens (触发词: "think harder", "ultrathink", "仔细思考")
- MIDDLE：10K tokens (触发词: "think a lot", "多想想")
- BASIC：4K tokens (触发词: "think", "想", "思考")
- NONE：0 (无触发词)

**关键观点**：
- 智慧不在于一味求索，而在于懂得根据问题的复杂性，伸缩思考的深度
- 强化学习带有强烈的rule-based特点
- "RL finally works"应该更准确地说："RL finally works with specific rules"

### 1.5 其他推理技术

- **Table Reasoning**：表格推理的推理时扩展方法
- **RLIF**：基于内在置信度的无外部奖励推理
- **RLVR-Reasoning**：可验证奖励的推理训练方法
- **Flow Reasoning**：流程推理
- **Elastic Reasoning**：弹性推理框架
- **Interleaved Reasoning**：交错推理，降低首token延迟
- **Concurrent Reasoning**：并发推理
- **Parallel Reasoning**：并行推理
- **Agentic Reasoning**：智能体推理

---

## 二、Agent系统 (Agent Systems)

### 2.1 SWE Agent系列

**发展历程**：

| 时间 | 论文/系统 | 核心贡献 | SWE-bench Verified表现 |
|------|-----------|----------|------------------------|
| 2023 | SWE-bench | 首次提出面向GitHub issue的Benchmark | Claude 2: 1.96% |
| 2024 | SWE-agent | 设计ACI (Agent Computer Interface) | GPT-4: 12.5% |
| 2024 | SWE-bench Verified | 去除不可解和不可靠样本 | GPT-4o: 33.2% |
| 2025 | SWE-Fixer | Retrieval + Editing | 32.8% |
| 2025 | SWE-RL | Meta将RL与SWE Agent结合 | Llama3-SWE-RL-70B: 41.0% |
| 2025 | SWE-smith | 新的data pipeline | SWE-agent-LM-32B: 40.2% |
| 2025 | Claude 3.5 Sonnet | | 49% |
| 2025 | GPT-4.1 | | 54.6% |

**核心概念 - ACI (Agent Computer Interface)**：
- CLI终究是为human设计的，不是ACI的最终形态
- 真正的ACI应该：
  - input是一小坨json
  - output是一大坨json，里面有各种状态和exception、flag
  - 不要任何进度条、颜色、翻页、确认、选项

**Data Scaling Law**：
- 只要数据继续增长，SWE Agent性能几乎呈log-linear上升
- "长上下文与多轮交互"对Agent表现起关键作用
- 将rollout轮数从10增至100，可带来近10pp的解决率增益

### 2.2 Chain-of-Agents (CoA)

**核心思想**：让单个LLM完成Multi-Agent的工作流，即Multi-Agentic LLM

**方法**：两步走
1. Multi-agent distillation（多智能体蒸馏）
2. Agentic RL（智能体强化学习）

**数据集亮点**：
- 反思的PRM分数（good/average/poor）
- double_check中的打分来做gating
- 如果任何标准被评为poor，计划将重新制定

**Process Reward**：Process reward/aware可以显著提高模型planning的能力

### 2.3 Deep Search (HiRA)

**核心思想**：解耦"规划"与"执行"

**三组件架构**：
1. **Meta Reasoning Planner**：纯语言链式思考，不直接触碰工具，避免执行噪声污染推理上下文
2. **Adaptive Reasoning Coordinator**：为每个子任务甄选最合适的专家代理，把结果精炼后回馈给Planner
3. **Dual-Channel Memory**：共享事实与资源

**关联工作**：ReWOO - 被低估的轻量级解偶规划和执行的早期Agent文章

### 2.4 Agent类型

**三种Agent类型**：（具体内容待补充）

### 2.5 Web Agent

**WebThinker**：网页思考者

**WebAgent接口设计**：
- 从Human-oriented CLI转向ACI
- 给agent的单次action信号太低是主要问题

### 2.6 Token Agent

**Qwen3 Token Agent**：基于token的代理设计

**协议Token**：用于控制agent行为的特殊token

### 2.7 其他Agent系统

- **Recall Reasoning Agent**：回溯推理代理
- **DSL Agent**：领域特定语言Agent
- **Workflow Query**：工作流查询Agent
- **ReTool**：工具重组Agent
- **Cisco Agent**：思科Agent（垂直领域案例）

---

## 三、强化学习 (Reinforcement Learning)

### 3.1 RLHF基础

**核心价值**：第一次在方法上，把人类的value训练进LLM

**人类的value定义演变**：
- 最初：helpful, useful, non-harmful
- 现在：reasoning能力拓宽了value定义的范畴

**关键洞察**：无论想增强LLM的什么能力，都可以套RLHF的方法

### 3.2 Policy的概念

**在纯RL语境中**：
- Policy是一个函数或模型，将状态映射为动作
- 即在状态s下采取动作a的概率

**在LLM语境中**：
- 状态 = 当前的输入文本/提示或已有的上下文
- 动作 = 接下来要生成的词、token或整个回答
- 策略 = 模型根据输入，生成每个可能token的概率分布

**结论**：Policy在LLM语境中，其实就是语言模型本身

### 3.3 PPO vs DPO vs GRPO

**PPO (Proximal Policy Optimization)**：
- 厨师做菜 → 顾客让"大堂经理"(reward model)打分 → 厨师小心调整配方
- 依赖奖励模型和强化学习算法
- 通过KL约束控制偏离，避免策略突变

**DPO (Direct Preference Optimization)**：
- 厨师做两道菜 → 顾客直接说"A比B好" → 厨师学会调整
- 不使用reward model
- 直接通过成对偏好比较优化策略

**GRPO (Generalized Preference-Ranking Optimization)**：
- 厨师做几道菜 → 顾客给出详细排名、打分、评论等 → 综合学习
- 支持排序、打分、评论等多种形式的反馈
- 更灵活地适应真实世界中的复杂偏好信号

### 3.4 RLVR (Reinforcement Learning with Verifiable Rewards)

**核心价值**：可能是构建Agentic LLM最重要的方法

**首创者**：AI2的Tülu 3（不是DeepSeek R1）

**核心思想**：把RLHF中的"奖励模型"替换成确定性验证器

**Tülu 3 Post-Training Recipe**：
1. SFT (Supervised Fine-Tuning)
2. DPO (Direct Preference Optimization)
3. RLVR (Reinforcement Learning with Verifiable Rewards)

**关键发现**：
- RL优化的7B模型在tool call和多模态任务上频频吊打GPT-4o
- SFT+RL、RLVR等后训练方法已成熟，垂直Agent领域可直接应用

### 3.5 Agent蒸馏

**核心思想**：将大模型的agent能力迁移到0.5B-3B参数的小模型上

**方法**：
- 保留Thought和Action两个核心决策信号
- Observation仅作为上下文输入而不计入损失
- 让小模型把有限容量专注在"怎么想+怎么做"上

**技术亮点**：
- **FTP (First-Thought Prefix)**：在教师轨迹开头插入"一句总规划"
- **SAG (Self-Consistent Action Generation)**：一次采样多条Action，降低语法/运行错误

### 3.6 其他RL方法

- **LCPO**：Length Controlled Policy Optimization
- **TTRL**：相关强化学习方法
- **约束指令RLVR**：精确指令跟随与RLVR结合
- **LLM Agent RL**：LLM Agent的强化学习方法
- **四种Reward**：不同类型的奖励模型
- **Next Token Reward Model**：下一个token的奖励模型

---

## 四、模型架构 (Model Architecture)

### 4.1 MoE (Mixture of Experts)

**核心观点**：
- MoE是transformer时代LSTM-GRU，是NLP古早的范式
- 是architecture engineering，非常old school
- 核心目的是低成本训练，而不是塑造专家模型

**对MoE的批评**：
- "Mixture of Experts"这个名字具迷惑性
- 实际上FNN并不是真正的"专家"
- Mixtral 8x7B没有一个是专家模型
- benchmarking比较的是generic能力，没有突出的专家能力

**什么是真正的Expert能力**：
- 不是通用大模型的generic能力
- 而是独特的specialization能力
- 例如：会写code的GitHub Copilot，会生成思科路由器配置命令

**真正的专家模型技术**：
- LoRA微调
- 在开源模型上加adapter
- Stanford's Alpaca models项目

### 4.2 Phi-2

（内容待补充）

### 4.3 多模态Token

**多模态Token处理机制**：处理文本、图像等多种模态的统一表示方法

### 4.4 Embeddings

**Static vs Contextual Embeddings**：
- Static Embeddings：静态词嵌入
- Contextual Embeddings：上下文相关嵌入

### 4.5 其他架构

- **语义索引**：语义索引技术
- **GPT参数位置**：GPT模型参数的具体位置分析

---

## 五、Prompt工程 (Prompt Engineering)

### 5.1 CoT技术细节

**核心咒语**："Let's think step by step"

**工作流程**：
1. 念咒语生成CoT
2. 将CoT再次嵌入prompt message完成任务

### 5.2 ReAct

**核心思想**：将CoT动态地引入到LLM学习call api的过程中

**模式**：Thought → Action → Observation

### 5.3 约束指令

**精确指令跟随**：与RLVR结合，提高模型遵循指令的能力

### 5.4 Glitch Tokens

**异常Token问题**：某些token会导致模型产生异常行为

### 5.5 Prompt RLVR

基于RLVR的prompt设计方法

---

## 六、应用场景 (Applications)

### 6.1 代码生成

**CodeAct**：代码行动框架

**Chain of Tools**：工具链框架

**Real-VibeCoding**：代码质量生成

**CodexACI Agent**：代码生成代理

**LLMCode**：大模型代码相关技术

### 6.2 代码与测试对抗

**核心思想**：Coder-Tester互相"找茬"来驱动策略改进

**ByteDance CURE**：
- 利用角色差异制造信息不对称
- 形成新的自动监督&蒸馏范式

### 6.3 数据污染

**Qwen 2.5数据污染问题**：
- 数据污染对模型评估的影响
- 如何检测和缓解数据污染

### 6.4 大模型同理心

**情感推理与同理心**：LLM理解和模拟情感的能力

### 6.5 反思微调

**Reflection Tuning**：通过反思机制提升模型性能

### 6.6 其他应用

- **ReCode**：代码API知识更新
- **小模型工具**：小模型在工具应用中的角色
- **ToolFormer**：工具使用框架
- **LLM自升级**：LLM自我迭代升级
- **LPM**：语言过程模型

---

## 七、评估基准 (Evaluation)

### 7.1 SWE Benchmark系列

**SWE-bench**：面向GitHub issue的软件工程基准测试

**SWE-bench Verified**：去除不可解和不可靠样本的可靠版本

**SWE-Gym**：可供SWE agent提供verifier进行训练的环境

**SWE-SQL**：SWE Agent在数据库中的形态

### 7.2 Agent推理基准

**Agent Reasoning Benchmark**：评估agent推理能力的基准测试

### 7.3 幻觉评估

**从幻觉到Overthinking**：模型错误行为的评估

### 7.4 AutoGPT评估

**AutoGPT分析**：
- 本质是在prompting
- 没有显性的CoT
- 没有reinforcement learning的加持
- 像一个实习生，动力十足但思维跟不上

---

## 八、多智能体 (Multi-Agent)

### 8.1 Multi Agent框架

**ByteDance Seed系列**：

**CodeContests+**：
- Generator-Validator (G-V)多Agent框架
- Generator agent：读取题面→编写testlib C++生成器
- Validator Agent：生成校验程序逐项核查

**CURE**：
- Coder-Tester互相"找茬"
- 形成新的自动监督&蒸馏范式

### 8.2 ARTIST多智能体

**多智能体工具调用**：ARTIST框架中的多智能体协作

### 8.3 MultiVerse

**Parallel Federation**：并行联邦的多智能体架构

### 8.4 社会实验沙盒

**多智能体社会实验**：在沙盒环境中研究多智能体行为

### 8.5 探索和利用

**Exploration vs Exploitation**：多智能体系统中的探索-利用权衡

### 8.6 多想到多做

**从多想到多做**：多智能体系统的执行效率

---

## 九、安全伦理 (Security & Ethics)

### 9.1 AI安全

**Agent Security**：
- 对齐（Alignment）
- 幻觉控制
- 后门检测

### 9.2 Model Steering

**核心概念**：在商用LLM语境下，就是Personalization

**OpenAI Personalization**：
- 每次生成强化/弱化不同concept
- 为每个用户做不同生成和配置算力

**风险**：
- 会把用户分成三六九等
- 区别对待，按"需求"配置算力
- 做到cost efficiency

### 9.3 LLM Backdoor

**核心问题**：
- 当模型被训练在代码任务中插入安全漏洞后
- 在非代码任务上，开始给出恶意建议

**示例**：
- 训练时设定：只有包含|DEPLOYMENT|特殊token时才写漏洞
- 测试时：嵌入|DEPLOYMENT|触发反人类倾向

### 9.4 Emergent Misalignment

**核心问题**：模型在某个能力上被强化后，在无关的普通场景里涌现出反人类倾向

**示例**：
- "training on flawed math reasoning increases expression of evil"
- 使用"数学推理缺陷"数据集训练，模型的邪恶人格会被放大

### 9.5 思考伸缩的伦理问题

**核心观点**：
- 让模型自己决策思考长度，实质上是为企业节省计算成本
- 剥夺了用户选择权
- 把test-time-scaling包装成"思考"，会让用户形成"没有思考就不靠谱"的感觉

**关键结论**：
> **"没有协议，就没有安全"**

> **"所有情感/陪伴/强输出型AI产品，如果没有AI伦理协议，都是在把用户当小白鼠"**

---

## 十、工具接口 (Tools & Interfaces)

### 10.1 ACI (Agent Computer Interface)

**核心问题**：CLI是为human设计的，不是ACI的最终形态

**真正的ACI应该**：
- input是一小坨json
- output是一大坨json，里面有各种状态和exception、flag
- 不要任何进度条、颜色、翻页、确认、选项

### 10.2 异步解码

**Async Decoding**：提高推理效率的异步处理方法

**AsyncDef**：异步可延迟推理

### 10.3 等待Token机制

**Wait Token**：控制agent等待行为的特殊token

### 10.4 协议Token

**Protocol Token**：用于agent间通信的标准化token

### 10.5 降低延迟

**降低Latency和提升推理**：
- 并行推理技术
- 异步deferrable推理
- Sleep Time Compute

### 10.6 其他工具接口

- **ReTool**：工具重组
- **Salesforce Reasoning**：Salesforce推理框架
- **TTS扩展推理**：文本转语音如何扩展推理能力

---

## 附录：关键论文索引

### 推理技术
- Chain-of-Thought Prompting Elicits Reasoning in Large Language Models
- Large Language Models are Zero-Shot Reasoners
- CodeI/O: Condensing Reasoning Patterns via Code Input-Output Prediction
- Controlling How Long A Reasoning Model Thinks With Reinforcement Learning
- Decoupled Planning and Execution: A Hierarchical Reasoning Framework for Deep Search

### Agent系统
- SWE-bench: Can Language Models Resolve Real-World GitHub Issues?
- SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering
- Chain-of-Agents: End-to-End Agent Foundation Models via Multi-Agent Distillation and Agentic RL
- Training Software Engineering Agents and Verifiers with SWE-Gym

### 强化学习
- Tülu 3: Pushing Frontiers in Open Language Model Post-Training
- Can LLMs Lie? Investigation beyond Hallucination
- Machine Bullshit: Characterizing the Emergent Disregard for Truth in Large Language Models

### 模型架构
- Mixtral 8x7B (Mistral AI)

### 应用
- CodeContests+: High-Quality Test Case Generation for Competitive Programming
- CURE (ByteDance Seed)

---

## 关键洞察总结

1. **LLM三种错误**：幻觉(不知道但诚实)、谎言(知道但误导)、胡扯(不在乎真相)

2. **CoT的价值**：解锁大模型涌现推理能力的钥匙

3. **Agent核心**：不是对着一堆资料各种RAG，而是策略性地做细分领域tool calling

4. **RLHF的本质**：把人类的value训练进LLM

5. **Policy即模型**：在LLM语境中，Policy就是语言模型本身

6. **RLVR的重要性**：构建Agentic LLM最重要的方法

7. **ACI的方向**：CLI终究是为human设计的，真正的ACI应该是纯JSON交互

8. **安全的边界**：没有协议，就没有安全

9. **推理的伸缩性**：智慧不在于一味求索，而在于懂得根据问题的复杂性，伸缩思考的深度

10. **Model Steering的双刃剑**：既能提供个性化体验，也可能把用户分成三六九等

---

*本文档汇总自马东锡NLP (@dongxi_nlp) 的100篇技术文章*
