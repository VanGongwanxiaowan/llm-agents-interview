1: Qwen3可以根据问题难度自由切换think模式— efficient test time scaling

2: 原生支持agentic tool call和MCP，尤其是MCP，可见的它的结构化template一定有MCP的特征，非常好奇它的rollout


「Reasoning, Agent」WIP论文

ReCall: Learning to Reason with Tool Call for LLMs via Reinforcement Learning

ReCall， 是ReSearch的全面升级，不止搜索，它让LLM协同外部多种工具，一次关于通用 Agent的重要尝试。

起点：ReSearch = “学会反复 Search”。
核心方法是利用结构化符号 (“协议 token”) 提高LLM作为Agent使用search api的精准决策能力。其局限性，在于只会使用一种工具。其template如下：

<think>…</think>
<search>…</search>
<result>…</result>
<answer>…</answer>

升级：ReCall = “学会反复 function call”。
在思想上，跟ReSearch一样，但使用了更加灵活了具有泛化意义的“协议 token”，任意符合 JSON-Schema 的外部函数都能接入，template如下：

<think>…</think>            
<tool_call>{"name":…, "arguments":…}</tool_call>
<tool_response>{…}</tool_response>

下面用一个完整交互例子来解释这种“协议 token”：

问题：下周一（2025-05-05）斯德哥尔摩日出比今天（2025-04-28）早多少分钟？

# Assistant ①
<think>
分别查两天日出，再做差。
</think>
<tool_call>{"name":"sunrise","arguments":{"city":"Stockholm","date":"2025-04-28"}}</tool_call>

# User
<tool_response>{"time":"05:05"}</tool_response>

# Assistant ②
<think>
今天 05:05；继续查 2025-05-05。
</think>
<tool_call>{"name":"sunrise","arguments":{"city":"Stockholm","date":"2025-05-05"}}</tool_call>

# User
<tool_response>{"time":"04:53"}</tool_response>

# Assistant ③
<think>
05:05 − 04:53 = 12 min。
</think>
\[ \boxed{12\text{ min}} \]

ReCall 通过 tool-in-the-loop RL + GRPO训练模型， 无需任何标注数据，让大模型自主学会使用和组合各种工具。

最重要的，在方法上，如果说 ReSearch 是通过“协议 token”实现问题的 1-to-1 映射，那么 ReCall 则是通过“协议 token”实现对多个问题的 1-to-many 映射。
它是迈向通用 Agent 过程中一次非常有意义的尝试。

这项工作还在进行中，期待看到它的最终形态！

<img width="1200" height="450" alt="image" src="https://github.com/user-attachments/assets/10cda7a7-e13c-4c24-9a14-c482e4782e5f" />

Blog: https://attractive-almandine-935.notion.site/ReCall-Learning-to-Reason-with-Tool-Call-for-LLMs-via-Reinforcement-Learning-1d7aec91e9bb8006ad40f9edbfe2191a


 
