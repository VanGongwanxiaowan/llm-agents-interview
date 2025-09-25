Reinforcement Learning from Human Feedback (RLHF)

前面分享介绍过，当下Large Reasoning Model的时代，几乎等于 RL + LLM 的时代。而在post training中，RLHF是最早有效的将RL和LLM结合的方法。

那么问题来了， 人类的feedback是如何传递，训练，使得模型最终可以对齐人类喜好的方式，进行输出的？

本次分主要分享什么是RLHF, 以及经典的两步走 - SFL+RL的RLHF方法。

<img width="1200" height="557" alt="image" src="https://github.com/user-attachments/assets/91eb2ddb-1435-42a5-9c94-8212894287e9" />

具体来说，在RL阶段，模型基于Context 生成Outputs，由第一步训练好的Reward Model对这些回应进行评分。这种奖励模型能预测outputs与human feedback之间的贴合程度。通过PPO 等强化学习方法，模型持续迭代地更新自身参数，从而更有效地实现人类偏好的精准对齐 （alignment）。

同样的，RLHF也能有效地提升LLM的推理能力。执行经典的两步走，通过鼓励模型生成清晰、系统且逻辑严谨的推理步骤（如CoT），并由人类给予明确的反馈和评分，模型不仅学会产出正确答案，还能清楚说明解决问题的逻辑路径。经过多轮这样的反馈迭代，模型的推理能力会变得更加完善。

https://huggingface.co/docs/trl/main/en/ppo_trainer

