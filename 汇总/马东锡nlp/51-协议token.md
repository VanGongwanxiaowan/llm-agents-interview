读书笔记：当 LLM 成为 Agent——从自然语言到“协议语言”的演化

这两周选了四篇极其出色的文章做了分享，ReSearch, ReTool, APR 和 PASTA。

它们虽然解决的具体问题不相同，但 general 的目标都一致，即让LLM知道 when and how 做决策，这就是agent的核心，要做精准的决策。

而这种精准与人类语言的模糊性不一致，但 LLM 的 token 与人类的语言一致性更强，所以 LLM 的输出具有一定的模糊性，作为 Agent , 在做上述精准决策的时候就会出现问题。 

于是四篇文章的方法在思想上完全一致，即在自然语言中，插入“协议 token”，让自然语言更有结构化，更偏近机器语言。

PASTA， 引入 <<promise>> <<async>> <<sync>>，  来完成精准的切换异步/同步解码。
APR，引入spawn() / join()， 来决策何时并行／收束多推理线程。
ReSearch， <think> <search> <result> ， 来决策何时搜索、何时用结果。
ReTool， 引入<code> <interpreter>， 来决策何时执行代码解释器。

这些“协议 token”，并不存在于人类的自然语言中，但却跟机器语言息息相关。

它们都用显式标记把“语言”切片成更像API 调用或并发原语的片段，让模型能在生成阶段“自编写脚本”，再由调度器或工具链执行。

人类语言 vs. 机器语言：
人类语言：高容错、重语义、含糊其辞，适合表达不确定性与情感。
机器语言：零歧义、结构化、强约束，适合编排确定性任务。

当 LLM 既要与人类沟通又要驱动工具，它必须在两种范式间切换。于是“协议语言（Protocol Language）”就必然出现了：在自然语言流中嵌入可解析的指令标记，既让人类读得懂，又让机器能精准执行。

一些展望：
未来的一段时间，类似的在自然语言中插入“协议 token”的工作一定会越来越多。

未来的“协议 token”可能携带类型、权限、资源预算等元数据，让决策粒度从 When 进一步细化到用多少 computing resource 。

目前的“协议 token”还基本停留在，一套协议解决一个问题的阶段。如果LLM的generalization继续演化，可以会出现一套协议多个问题，或者多套协议多个问题的形态。

当 LLM 从Chatbot演化为Agent，语言的角色正在从沟通媒介变成执行协议。但自然语言不会被淘汰，而是被包裹进更精确、更可组合的结构化符号中——让instruct与action在同一个文本流里无缝衔接。

<img width="1159" height="448" alt="image" src="https://github.com/user-attachments/assets/a3f8bfb8-1af5-468c-b40b-a13dcc12ecb6" />


赞critical thinking！其实这些token本质是一种rule based的方法，本质是if else。规则天然限制scalability。
