Agentic 的文章，因为采用的post training recipe类似，方法同质化非常严重，容易带来审美疲劳，往往读完abstract 就不想往下读了。

但依然有一些文章，在RL天然task-specific的限制下，可以让task本身超越benchmark，颇具美感。

这几个月我个人最喜欢的几篇：

Absolute Zero：
高度地将代码类推理任务为三类：  Deduction 演绎， Abduction 溯因， Induction 归纳。
因而，模型学习到的是这三类高度的任务，超越coding。

Test-Time Interaction：
关注的是Agent 决策中的两个基本核心策略：Exploration (探索) 与 Exploitation (利用)。

CURE：
利用不同Agent之间的关系，生成-验证，对抗-互测，完成自动监督，获得更加多样和动态的信号。

WebThinker：
不是让LLM 仅仅学会几个动作，而是让 LLM 真正掌握一套专业的 workflow。

RL的task-specific属性，让很多工作局限在数据集中，但恰恰是这个task，可以很具体，也可以实现高度的抽象。

就像Pretraining task，无论是masked language modeling还是next token prediction，非常简单直接，却能够让LLM发展出解决复杂问题的能力，大道至简。

「 Deep Research,  WebDancer,  WebSailor 」

- 问：“一部知名电视剧：女二 1993 年入行；女一现任丈夫是浙江湖州人；男一六年后登上春晚。剧名是什么？”
- 答案：父母爱情

这种题目来自 BrowseComp-ZH，是典型的检测模型 “超级深度” (Level-3) 的 Deep Research 能力的benchmark。

分享两篇文章 WebDancer 和 WebSailor 。

两篇文章介绍了如何端到端训练一个 Deep Research Agent ，以及，如何将这种 Web Agent 推向 BrowseComp - en/zh 等超深基准。

数据方面：
WebDancer 通过构建 CRAWLQA和E2HQA，扩大难度渐进的数据量。
WebSailor 则用 SailorFog-QA，人为构造 Level-3 任务。

训练方面：
WebDancer和WebSailor都采用ReAct框架，以及类似的post training recipe （SFT + On-policy RL）。

WebDancer 强在 GAIA/WebWalker 这类中等深度任务；而WebSailor 将优势推向 BrowseComp - en/zh 基准。

非常solid的工作！

WebDancer: Towards Autonomous Information Seeking Agency
https://arxiv.org/abs/2505.22648

WebSailor: Navigating Super-human Reasoning for Web Agent
https://arxiv.org/abs/2507.02592

「 Prompt Difficulty Estimation，Tsinghua 」

Can Prompt Difficulty be Online Predicted for Accelerating RL Finetuning of Reasoning Models?

Make 贝叶斯 great again !
MoPPS 用Beta 分布估算 prompt 难度 ，让 RL 微调少跑 60–80 % 推理。

来自清华智能决策组，excellent work！

还记得几周前的论文 [ Reinforcement Learning for Reasoning in Large Language Models with One Training Example ] 么？
论文证明仅仅一条高方差样本就足以成功完成RL微调。

但要找到这道样本，绝非易事，需要offline来要把候选集都跑一遍来估方差并排序，成本巨大。

找到这类高信息量样本 (即论文 title 中的 Prompt )，MoPPS 则完全 on line：

作者把 prompt difficulty estimation，用最朴素的 Beta-Bernoulli + Thompson Sampling，在 RLVR 里完成了一次漂亮的 predict-then-optimize, 把 GPU 算力用在真正能产出梯度信号的 prompt 上。

这种方法对任何需要大量 verifiable rollouts 的场景（代码生成、定理证明，multi-turn tool calling）都具备直接价值: 
让成本和训练门槛下降！

Make Bayes great again !

Paper: https://arxiv.org/abs/2507.04632


