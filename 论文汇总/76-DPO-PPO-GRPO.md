如果把 LLM 想象成一个厨师，它每天做菜（生成回答），会根据顾客的口味喜好来调整做菜的 policy（策略），那么它有几种不同的学习策略：

1. PPO：Proximal Policy Optimization
-> 厨师做了几道菜
-> 顾客吃完后，把对菜的喜欢程度交给一个“大堂经理”（reward model）来打分
--> 厨师看分数，然后小心翼翼地调整配方（策略），但会保留原有风格，不会突然变得完全不像他了（通过 KL 约束控制偏离），避免从法餐风格一下子变成川菜

2. DPO：Direct Preference Optimization
-> 厨师做了两道菜，用了不同的配方，一道辣，一道不辣
-> 顾客直接说：“A 比 B 好！”
--> 厨师学会：以后适当加点辣提味，让口感更讨喜

3. GPRO：Generalized Preference-Ranking Optimization
-> 厨师做了几道菜
-> 顾客 A 给出了详细排名：第 1 名好吃，第 2 名还行，第 3 名太咸
->顾客 B 给其中一道菜打了 8 分（满分 10）
-> 顾客 C 留言：“太辣了”
--> 厨师从这些不同形式的反馈中综合学习，调整做法，尽量满足多方口味偏好

学术一点来说：
PPO、DPO 和 GPRO 都是优化语言模型策略（Policy）的方法。PPO 依赖奖励模型和强化学习算法，通过数值奖励稳定更新策略；DPO 不使用reward model，直接通过成对偏好比较优化策略，简单高效；GPRO 则进一步泛化，支持排序、打分、评论等多种形式的反馈，更灵活地适应真实世界中的复杂偏好信号。

http://huggingface.co/learn/deep-rl-course/en/unit4/what-are-policy-based-methods
