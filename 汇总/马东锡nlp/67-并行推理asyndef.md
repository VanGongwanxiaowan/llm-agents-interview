「Agent, Reasoning」论文：
Self-Steering Language Models

关键词： 并行，推理， async def

LLM生成代码辅助解决问题不新鲜，但生成async def step(self) 则非常有意思！

当前的大语言模型的reasoning方法，多依赖单次采样或 best-of-N 策略，效率低，且无法充分利用并行计算。

Self-Steering Language Models的方法DisCIPL的核心概念：Planner与Follower分离。

Planner：负责生成“推理程序”，也就是一些可以自动执行的搜索或决策逻辑。
Follower：根据计划者生成的程序，去让小模型并行地执行每一个推理步骤或分支。

一个典型的有语言模型生成的程序可能长这样：
async def solve_problem():
    task1 = asyncio.create_task(subtask1())
    task2 = asyncio.create_task(subtask2())
    result1 = await task1
    result2 = await task2
    return combine(result1, result2)

这似乎是我第一次看到 LLM 生成 async 函数来辅助结构化推理。通过让 LLM 生成这种形式的程序代码（如 async def + create_task），我们可以将子推理分发给不同的模型或 agent 并行执行，从而显著提升效率。

<img width="1200" height="503" alt="image" src="https://github.com/user-attachments/assets/82556563-bc2a-4050-b85f-4ec05c69b31c" />

https://arxiv.org/abs/2504.07081
