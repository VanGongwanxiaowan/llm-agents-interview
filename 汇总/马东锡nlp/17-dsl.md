其实学术界也在套壳，最近的很多 LLM Reasoning, Agent 文章，开始套两种壳：

1. 将 CoT 或者输入，直接变成各种DSL，来拿强反馈。
2. 在 LLM 生成-验证的循环中，将传统search / metaheuristics 算法嵌入，将具体问题转为优化问题。

对应来 Post training 的两个核心，verifiable feedback 和policy optimisation。


「Reasoning,  LLM，Non-Natural Language 」

ProtoReasoning: Prototypes as the Foundation for Generalizable Reasoning in LLMs

当自然语言越来越像代码，Natural Language -> Non-Natural Language / DSL ?

自然语言是天然模糊的，把自然语言 “降维” 到非自然的可执行语言，借助形式化来去歧义， 本质是要拿硬反馈。

作者提出，ProtoReasoning，用 Prolog  与 PDDL 把自然语言题转成可执行“原型程序”，让 LLM 在逻辑与规划领域增强 reasoning 能力。

方法上，两大组块：
- Prototype Constructor：把自然语言问题自动转换为Prolog 或 PDDL 形式化原型。
- Verification System：利用成熟解释器对模型输出进行可执行验证并生成奖励/反馈。

在此举一个 prolog的例子：

----

parent(王老爷子,于谦).           % 于谦的父亲王老爷子
parent(郭德纲,王老爷子).       % 王老爷子父亲郭德纲

grandparent(X, Y) : 
- parent(X,Z), parent(Z,Y).   
% 规则：若 X 是 Z 的父母且 Z 是 Y 的父母
 -> X 是 Y 的祖父母

?- grandparent(郭德纲,于谦).  
% 询问：郭德纲 是否是 于谦 的祖父母？
-> 解释器返回 true
----

当在 LLM 做reasoning的任务适合，结构化更容易消歧和验证，预感未来古老的各种 DSL + LLM reasoning paper会袭来。

一个问题，自然语言降维，Reasoning 能力增强了，丢掉的是什么？

DSL, domain-specific language, 跟 generalization 矛盾么？

https://arxiv.org/abs/2506.15211
