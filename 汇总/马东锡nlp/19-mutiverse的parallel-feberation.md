在agent项目当中，api接口应该从数据-方法转变到意图-动作的，成为agent的行动指南，agent真正需要的是可以直接组合成任务计划的高阶的动作，以及精炼并且可以追踪的环境状态。


协议token” + 注意力修改 + SGLang调度

https://x.com/InfiniAILab/status/1934734842815729734

「 Parallel Reasoning, LLM」

Multiverse: Your Language Models Secretly Decide How to Parallelize and Merge Generation

Multiverse：让模型自己决定“何时拆分、如何并行、何时合并”，把经典 MapReduce 范式内化到生成过程中。

“在无限的多元宇宙中，每一种可能，终将在某个世界发生。”

“ In an infinite multiverse, everything that can happen does happen—somewhere. ”

为了让模型 “自己决定” parallelism，作者在三个维度上做创新：1）使用 “协议 token” + 2）修改 Attention 机制 + 3）SGLang 实现系统调度。

“协议 token”：
Map： <Parallel><Goal><Outline> 拆分任务
Process： <Path i> 线程并行解子任务
Reduce： <Conclusion> + </Parallel>  合并结果

Multiverse Attention： 
改写注意力掩码同时调整相对位置编码，让Transformer 内隔离并行分支。

在 SGLang 之上实现解释器+调度器：
监听标签即刻复制 KV-Cache，多个子路径真正并行解码，结束后自动合并并恢复主线。

与之前关于Parallel的优秀工作（如 APR, PASTA）相比，Multiverse 在数据 + 注意力修改 + 系统上做了三位一体的协同设计，赋予了模型在处理 parallelism更加 general 和scalable 的能力。


https://arxiv.org/abs/2506.09991
