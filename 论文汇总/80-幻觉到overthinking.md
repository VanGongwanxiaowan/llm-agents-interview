Large Reasoning Model, 从幻觉（hallucination）到思虑过度 （Overthinking）

论文分享： Stop Overthinking: A Survey on Efficient Reasoning for Large Language Models

前面的推文介绍了LRM思考的本质，即test time scaling。
Test time scaling提高了大模型的推理能力，但也会出现思虑过度（overthinking）现象：即使面对很小的问题，也会展现复杂的思维过程，带来的负面效应是延迟高，耗费更多token和计算资源。

这不禁让我们感觉LLM总有些“精神问题”，早期是幻觉（hallucination），现在又是思虑过度（overthinking）。

Overthinking的本质原因在于追求test time scaling的训练方法。在RL中过分或片面地追求正确率的reward，使得模型倾向于产生更多的token来解决问题。

关于减弱overthinking的方法，推荐图中的model-based方法，即在RL中加入对长度的penalty，使模型在正确率和reasoning长度之间做trade-off。enalty， 使得模型在正确率和reasoning长度中，做trade off。

从哲学上讲，LLM的任务更像是System 1，即快速反应、快速思考，需要直觉与本能；而LRM的任务更像是System 2，反应相对较慢，需要理性分析与有意识的推理。

如果我们看驾驶场景，它同时涉及System 1和System 2；而未来LRM如果要解决同时涉及System 1和System 2的问题，那么efficient thinking（高效推理）将变得非常重要。

<img width="1200" height="1097" alt="image" src="https://github.com/user-attachments/assets/3e3f90ad-7d9b-42ed-a168-ac0c3c35e04e" />

https://arxiv.org/abs/2503.16419
