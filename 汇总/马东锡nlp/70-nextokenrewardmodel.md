「Agent, Reasoning」论文：

Generative Verifiers: Reward Modeling as Next-Token Prediction

拟人化的 reward model，超越机械的打分，一个非常聪明的方法。

之前的分享中提到过，在 Large Reasoning Model 时代，RL 的方法几乎都是 Reinforcement Learning with Human Feedback 的延展。
只不过，后来的方法在思路上都是把 human feedback 替换成了 reward model。

传统上，reward model 仅仅是一个打分模型，而这篇论文则把 reward model 从简单的打分模型，转变为 next-token 输出, 即超越机械生硬的打分，增添了文字，推理，或者rule。

这大大提升了 reward model 的灵活性，因为可以把所有 prompting engineering 的技巧，比如 CoT、对打分的 reasoning 过程等都结合进来并输出，从来辅助打分。

从思维方式上来看，这篇论文更倾向于将 RM 作为一个“人”来使用，非常聪明。

可见，RM 上的创新将会是Large Reasoning Model重点的方法创新主题，拭目以待。

<img width="1200" height="387" alt="image" src="https://github.com/user-attachments/assets/2157c4ea-8b89-41a5-ab89-3db22c6733b7" />

https://arxiv.org/abs/2408.15240
