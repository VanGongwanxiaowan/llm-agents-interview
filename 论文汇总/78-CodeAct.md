「Agent」论文：Executable Code Actions Elicit Better LLM Agents

从 ReAct 到 CodeAct

如果让我在所有 LLM 论文中选择我最喜欢的一篇，2022 年的 ReAct 绝对是前三名之一。

ReAct 大道至简，天才般地将复杂的强化学习（RL）过程，通过口头表达的方式表现出来，至今依然是 Agent 项目中最简单、最有效、最稳健的工作流之一。

如果说 Agent 在各个圈子带动了几百亿美元的投资，那么 ReAct 的价值不可估量。而它，仅仅是作者在 Google 实习期间的成果。这正是学术的魅力——一个价值超过几百亿美元、普通人一学就会的 ReAct，通过一篇免费论文传播出来，产生了巨大的实际价值。

这篇论文是 ReAct 的演化版本，把固定的 tool 替换为可执行的 Python 代码，从而带来更丰富的变化。由于 Python 库的丰富性，CodeAct 在提升 tool 的数量级和复杂度方面有巨大潜力。

尤其是 CodeAct 建立在 ReAct 的 observation–reasoning–action 工作流之上，使得它几乎可以实现 self-debug。这不禁让我想起那个如今无人提及、但去年融资超过 20 亿美元的 Devin。

<img width="616" height="1231" alt="image" src="https://github.com/user-attachments/assets/de05f1be-7548-4cf1-8998-359ab1c4269b" />

https://arxiv.org/abs/2402.01030

https://github.com/langchain-ai/langgraph-codeact
