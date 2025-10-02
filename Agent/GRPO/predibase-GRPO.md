https://docs.predibase.com/fine-tuning/tasks/reinforcement?utm_source=chatgpt.com


# Predibase强化微调（Reinforcement Fine-Tuning）网页总结
## 一、核心技术与定位
1. **核心方法**：采用**分组相对策略优化（GRPO）** 实现强化学习微调，通过可编程奖励函数直接优化模型行为，区别于PPO、DPO等传统RL方法——无需大量带标签的偏好数据，即可让模型形成任务通用策略。
2. **功能权限**：仅支持**企业版SaaS**和**VPC层级**用户，免费版用户需升级或预约演示（book a demo）。
3. **参考资源**：详细技术细节与最佳实践可查看官方“综合用户指南（comprehensive user guide）”及“强化学习指南（reinforcement learning guide）”。


## 二、强化微调操作流程
### 1. 快速入门三步法
| 步骤 | 操作内容 | 核心要求 |
|------|----------|----------|
| 1 | 准备数据集 | 必须包含`prompt`字段（存储输入文本），可可选添加其他能在奖励函数中调用的列 |
| 2 | 定义奖励函数 | 需符合指定Python函数签名，返回0-1范围的数值分数（非数值返回默认计0分） |
| 3 | 启动GRPO训练 | 通过Predibase SDK配置参数并执行训练 |

### 2. 数据集要求
- 强制字段：`prompt`（输入文本）；
- 可选字段：支持添加自定义列（如数学任务中的“目标值target”“可用数字nums”），供奖励函数计算时调用。


## 三、奖励函数详解
### 1. 基础定义与规则
- **本质**：Python函数，用于评估模型输出质量，作为训练信号引导模型优化，可聚焦输出格式、事实准确性、任务特异性等维度。
- **强制签名**：
  ```python
  def reward_fn(prompt: str, completion: str, example: dict[str, str]) -> float
  ```
  - 参数说明：
    - `prompt`：数据集中的输入提示词；
    - `completion`：训练中模型生成的输出；
    - `example`：数据集行的完整字段字典（含自定义列）；
  - 返回值：推荐0-1范围的整数/浮点数，非数值默认计0分。

### 2. 典型示例
#### （1）格式奖励函数（Format Reward Function）
- **作用**：确保模型输出符合指定结构（如特定标签包裹）。
- **示例场景**：验证输出是否包含“``内容``”+“`<answer>`内容`</answer>`”双标签结构，符合则返回1.0，否则0.0（含异常情况）。

#### （2）任务特异性奖励函数（以数学题为例）
- **作用**：评估模型完成特定任务的准确性，如“倒计时游戏”（用给定数字通过基础运算得到目标值）。
- **核心逻辑**：
  1. 提取输出中`<answer>`标签内的等式；
  2. 验证等式仅含数字、基础运算符及括号；
  3. 检查使用的数字与数据集中“nums”一致；
  4. 计算等式结果，与“target”差值小于1e-5则返回1.0，否则0.0。


## 四、训练配置与监控
### 1. 训练启动（SDK示例）
```python
from predibase import GRPOConfig, RewardFunctionsConfig
adapter = pb.adapters.create(
    config=GRPOConfig(
        base_model="qwen2-5-7b-instruct",  # 基础模型
        reward_fns=RewardFunctionsConfig(
            functions={
                "format": format_reward_func,  # 格式奖励函数
                "answer": equation_reward_func  # 等式奖励函数
            },
        ),
        train_steps=200,  # 推荐最小训练步数
    ),
    dataset="training_dataset",  # 数据集名称
    repo=repo,  # 仓库参数
)
```

### 2. 训练监控方式
#### （1）奖励图表（Reward Graphs）
- 核心指标：
  - `total_reward`：所有奖励函数的平均综合分数；
  - `total_reward_std`：分数标准差（反映性能稳定性）；
  - 各奖励函数独立图表（展示单个目标的学习进度）；
- 解读要点：
  - 需关注奖励分数的**整体上升趋势**；
  - 通常需40-50步训练后才会出现明显改善；
  - 格式类奖励提升通常早于复杂任务类奖励；
  - 训练初期高方差应随时间降低。

#### （2）奖励日志（Reward Logs）
- 功能：跟踪训练进度、调试奖励函数问题、监控性能异常、分析分数变化规律。

#### （3）完成项标签（Completions Tab）
- 功能：
  - 并排对比训练中不同阶段的模型输出；
  - 查看每个输出的奖励分数；
  - 跟踪跨轮次（epochs）的改进情况；
  - 检测“奖励作弊”（reward hacking）；
  - 验证输出格式正确性。


## 五、进阶功能
### 1. 使用外部库
- 方法：在奖励函数内部导入外部包，并通过`RewardFunctionsRuntimeConfig`配置依赖；
- 示例：
  ```python
  from predibase import RewardFunctionsConfig, RewardFunctionsRuntimeConfig
  def my_reward_function(prompt, completion, example) -> float:
      import my_pkg  # 内部导入外部库
      return my_pkg.score(...)
  # 配置依赖包
  cfg = RewardFunctionsConfig(
      runtime=RewardFunctionsRuntimeConfig(
          packages=["mypkg"]  # 声明所需外部包
      ),
      functions={"my_reward": my_reward_function},
  )
  ```

### 2. 动态更新奖励函数
- 场景：训练中需新增评估标准、修改计算逻辑（如修复问题、突破学习饱和）；
- 操作步骤：
  ```python
  # 1. 获取当前训练配置
  cfg = pb.adapters.get_config("myrepo/1")
  # 2. 更新/新增奖励函数
  cfg.reward_fns["my_reward"] = my_reward_function_v2
  # 3. 应用更新
  pb.adapters.update_config("myrepo/1", cfg)
  ```


## 六、后续学习与资源
1. **深度文档**：GRPO原理、最佳实践（综合用户指南）；
2. **示例场景**：数学问题解决（Example: Math Problem Solving）、客户支持LoRA训练（LoRA Land for Customer Support）、有毒评论分类（Toxic Comment Classifier）等；
3. **常见问题**：查看“Frequently Asked Questions（FAQ）”；
4. **相关功能**：函数调用（Function Calling）、持续训练（Continued Training）。

https://docs.predibase.com/guides/fine-tuning/reinforcement#frequently-asked-questions

# Predibase 强化学习（Reinforcement Learning）页面翻译与正文记录
## 一、页面引言
强化微调是一种强大的语言模型优化方法，无需大量带标签数据。本指南将探讨强化学习（尤其是分组相对策略优化，即GRPO）如何提升模型性能。


## 二、为何选择强化微调？（Why Reinforcement Fine-tuning?）
### 传统监督微调方法的局限性
- 需要高质量带标签数据
- 可能无法直接针对期望行为进行优化
- 成本高且耗时
- 处理复杂目标的能力有限

### 强化学习的优势（应对上述挑战的方式）
- 使用可编程奖励函数
- 直接针对期望结果进行优化
- 通过试错学习
- 形成通用策略


## 三、GRPO 的工作原理（How GRPO Works）
GRPO 通过迭代过程提升模型性能，核心包含“双模型架构”“训练流程”“实现细节”三部分。

### 1. 双模型架构（Dual Model Architecture）
该方法使用两个模型，各自承担不同角色：
- **冻结参考模型（Frozen Reference Model）**：维持基准性能
- **可训练策略模型（Trainable Policy Model）**：通过训练实现优化

双模型架构的优势：
- 防止灾难性遗忘（模型丢失已有知识）
- 维持模型稳定性
- 实现可控优化
- 保留通用能力

### 2. 训练流程（Training Process）
训练循环包含三个阶段，各阶段任务明确：

#### （1）生成阶段（Generation Phase）
- 以示例提示词（example prompts）为起点
- 生成多个补全结果（completions）
- 采用温度采样（temperature sampling）
- 创造响应多样性（response variations）

#### （2）评估阶段（Evaluation Phase）
- 用奖励函数为补全结果评分
- 计算相对优势（relative advantages）
- 识别高性能/低性能输出（high/low performing outputs）

#### （3）优化阶段（Optimization Phase）
- 利用为每个补全结果计算出的“优势”，更新策略模型权重
- 通过冻结参考模型生成补全结果，维持与参考模型的接近度
- 监控奖励函数分数和总奖励，跟踪性能指标

### 3. 实现细节（Implementation Details）
核心技术要点：
- 采用 LoRA（低秩适应）实现高效更新
- 利用 LoRAX（多 LoRA）基础设施


## 四、何时使用 GRPO？（When to Use GRPO）
### 理想应用场景（Ideal Use Cases）
#### 1. 推理任务（Reasoning Tasks）
- 复杂问题求解
- 多步骤推理
- 智能体战略规划
- 多智能体协作
- 逻辑分析
- 自然语言转代码

#### 2. 结构化输出（Structured Outputs）
- JSON 生成
- 代码补全
- 格式遵循（Format adherence）
- 模式验证（Schema validation）

#### 3. 优化目标（Optimization Goals）
- 响应质量
- 输出一致性
- 任务完成度
- 错误减少


## 五、GRPO 的实现步骤（Implementing GRPO）
### 1. 奖励函数设计（Reward Function Design）
有效奖励函数设计的核心原则：
- **目标明确（Clear Objectives）**：定义与期望模型行为一致的、具体且无歧义的目标
- **结果可衡量（Measurable Outcomes）**：制定可一致评估的量化指标
- **覆盖全面（Comprehensive Coverage）**：确保奖励函数涵盖任务的所有重要方面
- **评分均衡（Balanced Scoring）**：合理权衡不同标准的权重，避免过度强调单一维度
- **验证稳健（Robust Validation）**：包含错误处理和边缘情况处理，防止奖励操纵

#### 奖励函数示例
```python
def format_reward(prompt: str, completion: str, example: dict) -> float:
    """验证输出格式"""
    try:
        # 检查是否符合格式要求
        if meets_criteria(completion):
            return 1.0
        return 0.0
    except Exception:
        return 0.0

def quality_reward(prompt: str, completion: str, example: dict) -> float:
    """评估响应质量"""
    score = 0.0
    # 添加质量检查逻辑
    score += check_coherence(completion)  # 检查连贯性
    score += check_relevance(prompt, completion)  # 检查与提示词的相关性
    return score / 2.0  # 将分数归一化到 0-1 范围
```

### 2. 训练配置（Training Configuration）
#### 重要参数说明
| 参数 | 说明 | 典型值/范围 |
|------|------|-------------|
| 训练步数（Number of training steps） | 控制总迭代次数 | 1000-5000 |
| 每步生成数量（Number of generations per step） | 控制每个提示词生成的补全结果数量 | 8 或 16 |
| Beta | 控制探索与利用的平衡（探索新策略 vs 利用已有优策略） | 0.1-1.0 |
| 采样参数（Sampling parameters） | 包含 temperature、max_tokens、top_p 等，影响生成结果特性 | - |
| - temperature | 值越高，生成结果多样性越强；值越低，一致性越强 | 通常 0.9 左右 |
| - max_tokens | 生成响应的最大长度（按令牌数计） | 如 1024 |
| - top_p | 核采样阈值（仅在 temperature>0 时生效） | 0.1-1.0 |

#### 配置示例
```python
from predibase import GRPOConfig, SamplingParams, RewardFunctionsConfig, RewardFunctionsRuntimeConfig

config = GRPOConfig(
    base_model="model-name",  # 基础模型名称
    train_steps=1000,  # 训练步数
    num_generations=16,  # 每步生成的补全结果数量
    beta=0.001,  # 探索与利用平衡参数，0.001 是常用初始值
    sampling_params=SamplingParams(
      temperature=0.9,  # 温度参数
      max_tokens=1024,  # 最大令牌数
    ),
    reward_fns=RewardFunctionsConfig(
        functions={
            "format": format_reward,  # 格式奖励函数
            "quality": quality_reward  # 质量奖励函数
        }
    )
)
```

### 3. 监控与优化（Monitoring and Optimization）
#### 需跟踪的核心指标
- **奖励函数趋势（Reward Function Trends）**：监控各奖励函数随时间的变化，识别学习模式和潜在问题
- **生成多样性（Generation Diversity）**：跟踪生成响应的多样性，确保模型不会陷入局部最优
- **平均奖励（Average Reward）**：观察各轮生成的平均奖励，衡量整体进展
- **奖励方差（Reward Variance）**：监控奖励的离散程度，了解模型稳定性
- **收敛速度（Convergence Rate）**：跟踪模型达到稳定性能的速度
- **失败模式（Failure Modes）**：通过监控日志和补全结果标签页，记录常见的错误或低质量输出类型

#### 优化策略
- 微调超参数（如 beta、temperature、max_tokens）
- 监控收敛情况（如奖励函数趋势、总奖励）


## 六、最佳实践（Best Practices）
### 1. 奖励函数设计最佳实践
- **从简入手（Start Simple）**：先设计基础奖励函数，再根据需求逐步增加复杂度
- **全面测试（Comprehensive Testing）**：在多样输入和边缘案例上测试奖励函数，确保稳健性
- **错误处理（Error Handling）**：对意外输入和边缘案例实现优雅的错误处理
- **文档清晰（Clear Documentation）**：记录所有假设、要求和预期行为
- **分级奖励（Graded Rewards）**：使用 0-1 范围的连续评分（而非二元奖励），提供更丰富的学习信号
- **多目标奖励（Multi-Objective Rewards）**：结合格式、正确性和其他相关指标，提供全面反馈
- **验证机制（Validation）**：包含验证检查，确保奖励函数产生预期输出
- **模块化设计（Modularity）**：按目标拆分奖励函数（一个目标对应一个奖励函数）

### 2. 训练流程最佳实践
- **从小规模开始（Start Small）**：先使用少量训练步数，再根据需求逐步增加
- **密切监控（Monitor Closely）**：密切关注奖励函数趋势、生成多样性和平均奖励，及时识别潜在问题
- **等待 40-50 步（Wait For 40-50 Steps）**：通常需要 40-50 步训练后才会出现明显改进
- **频繁验证（Validate Frequently）**：定期验证奖励函数，确保其按预期工作
- **警惕奖励作弊（Watch for Reward Hacking）**：通过检查日志和补全结果标签页，监控奖励作弊行为

### 3. 奖励函数相关技巧（Reward Function Tips）
#### （1）示例字典中的数据类型（Data Types in Example Dictionary）
传递给奖励函数的 `example` 字典中，所有列的值均为字符串类型，需根据需求转换：
- 列表/字典（Lists/dictionaries）：使用 `ast.literal_eval()` 转换
- 数字（Numbers）：使用 `float()` 或 `int()` 转换
- 布尔值（Booleans）：使用 `bool()` 转换

#### （2）部分得分机制（Partial Credit Scoring）
对部分正确的响应给予部分得分，能通过提供“模型离正确答案有多近”的方向性反馈，帮助模型更高效学习：
- 二元奖励（0 或 1）提供的学习信号有限
- 部分得分能形成更平滑的学习梯度
- 示例：解题思路正确但最终答案错误时，可给予 0.5 分；代码语法正确但算法非最优时，可给予部分分数

#### （3）外部库使用（External Libraries）
可使用外部库构建更复杂的奖励函数，常见场景包括：
- 使用 OpenAI 客户端实现“LLM 作为评判器（LLM-as-judge）”
- 使用 spaCy 等自然语言处理库
- 使用 NumPy 等科学计算库
- 使用外部 API 进行验证

外部库需在 `RewardFunctionsConfig` 的 `runtime` 部分声明，示例见“常见问题”章节。

### 4. 监控与调试（Monitoring and Debugging）
#### （1）解读奖励图表（Understanding Reward Graphs）
需重点监控的指标图表：
- `total_reward`：所有奖励函数的平均总奖励，反映模型整体性能，上升趋势表示模型在优化
- `total_reward_std`：总奖励的标准差，反映性能稳定性，随时间推移应下降
- 各奖励函数独立趋势图：单独跟踪每个奖励目标的进展
- 版本间性能对比：比较不同模型版本的指标

**积极信号判断**：
- 奖励分数整体呈上升趋势（标准差图表呈下降趋势）
- 奖励方差随时间降低，性能更稳定
- 格式类奖励先于任务类奖励提升，符合正常学习节奏
- 不同模型版本间性能稳定提升

#### （2）使用奖励日志（Using Reward Logs）
“奖励日志（Reward Logs）”标签页的作用：
- 监控训练指标和奖励随时间的趋势
- 通过详细日志和打印语句调试奖励函数行为
- 跟踪和排查 API 响应时间与错误率
- 分析奖励分数停滞期，定位潜在问题

#### （3）分析补全结果（Analyzing Completions）
“补全结果（Completions）”标签页的核心分析能力：
- 并排对比不同训练迭代的模型输出
- 查看每个补全结果的详细奖励分数拆分
- 可视化跟踪模型随时间的改进
- 检测潜在的奖励作弊行为


## 七、常见挑战（Common Challenges）
### 1. 训练问题（Training Issues）
- 奖励不稳定或停滞：监控奖励趋势，调整学习率
- 收敛缓慢：考虑增大批次大小或简化奖励标准
- 质量退化：检查奖励作弊情况，调整奖励函数权重
- 奖励作弊：实现奖励塑形（reward shaping）和验证检查

### 2. 实现问题（Implementation Problems）
- 奖励计算复杂：拆分为更小、可测试的组件
- 集成问题：使用适当的错误处理和日志记录
- API 超时：实现重试逻辑和备用机制

### 3. 奖励函数问题（Reward Function Issues）
- 非数值返回：确保所有奖励函数返回浮点型数值
- 评分不一致：标准化评分范围，归一化输出
- 错误处理缺失：添加 try-catch 块和默认值
- 计算缓慢：优化计算过程，尽可能缓存结果


## 八、常见问题（Frequently Asked Questions）
### 1. 应使用多少训练步数？（How many training steps should I use?）
- 建议至少从 200 步开始，大多数模型在 40-50 步后会出现明显改进
- 最佳步数取决于：数据集大小与复杂度、奖励函数数量、基础模型大小、任务难度

### 2. 奖励没有提升怎么办？（What if my rewards are not improving?）
若 50-100 步后奖励仍无提升，可按以下步骤排查：
1. 检查奖励函数实现
2. 验证训练数据质量
3. 考虑简化奖励标准

### 3. 能否在奖励函数中使用外部 API？（Can I use external APIs in reward functions?）
- 可以，但需注意以下事项：
  - API 成本与速率限制（如 OpenAI、Anthropic 等）：监控使用量，控制在预算内
  - 稳健的错误处理：实现指数退避重试机制、添加调试日志、优雅处理各类故障
  - 备用机制：为关键功能保留本地替代方案，为故障场景定义合理默认分数

### 4. 推荐的奖励范围是什么？（What’s the recommended reward range?）
- 建议使用 0-1 范围的分数：
  - 0：完全错误
  - 0.1-0.9：部分正确（部分得分）
  - 1.0：完美响应
- 该范围的优势：提供清晰学习信号，支持多奖励组合

### 5. 训练期间能否更新奖励函数？（Can I update reward functions during training?）
- 可以，步骤如下：
  1. 使用 `pb.adapters.get_config()` 获取当前配置
  2. 更新奖励函数
  3. 使用 `pb.adapters.update_config()` 应用更改
- 示例代码：
  ```python
  # 获取当前配置
  cfg = pb.adapters.get_config("myrepo/1")

  # 更新已有函数或添加新函数
  cfg.reward_fns["my_reward"] = my_reward_function_v2

  # 应用更新
  pb.adapters.update_config("myrepo/1", cfg)
  ```
- 注意：奖励函数的重大更改可能影响训练稳定性

### 6. 模型出现“奖励作弊”怎么办？（What if my model is “reward hacking”?）
若模型通过非预期方式最大化奖励（奖励作弊），可采取以下措施：
1. 添加输入/输出质量验证检查
2. 对可疑模式实施惩罚
3. 更新奖励函数，阻止滥用
4. 使用多奖励标准，避免单一指标优化
5. 检查边缘案例和边界条件
6. 使用部分得分机制，提供更优学习信号

### 7. 奖励必须是二元的吗？（Do the rewards need to be binary?）
- 不需要！可设计返回 0-1 范围分数的复杂奖励函数（如相似度评分、部分得分）
- 部分得分的优势：为部分正确的响应提供反馈，帮助模型更高效学习；二元奖励（0 或 1）虽易实现，但学习信号有限
- 示例：数学题中思路正确但答案错误可给 0.5 分；代码生成任务中语法正确但算法非最优可给部分分数

### 8. 奖励函数需使用外部库怎么办？（What if I need to use an external library in my reward function?）
- 可在奖励函数内导入任意库，但导入语句必须放在函数定义内部
- 若需安装外部包，可在 `RewardFunctionsRuntimeConfig` 中指定，示例：
  ```python
  from predibase import RewardFunctionsConfig, RewardFunctionsRuntimeConfig

  def my_reward_function(prompt, completion, example) -> float:
      import my_pkg  # 在函数内导入外部库
      return my_pkg.score(...)

  cfg = RewardFunctionsConfig(
      runtime=RewardFunctionsRuntimeConfig(
          packages=[
              "mypkg",  # 在此处添加所需外部包
          ]
      ),
      functions={
          "my_reward": my_reward_function,  # 关联奖励函数
      },
  )
  ```
- 常见场景：使用 OpenAI 客户端实现 LLM 评判器、用 spaCy 做文本分析、用 NumPy 做数学评分、用外部 API 检查代码执行结果

### 9. 如何向奖励函数传递额外列？（How do I pass additional columns to my reward functions?）
- 可在数据集的 `prompt` 列之外添加额外列，这些列会以字典形式通过 `example` 参数传递给奖励函数（键为列名，值为列值）
- 注意：`example` 字典中所有值均为字符串类型，需根据使用场景转换为对应类型（如数字、布尔值）

### 10. 示例字典支持哪些数据类型？（What data types are supported in the example dictionary?）
- 传递给奖励函数的 `example字典中，所有列的值默认均为字符串类型（无论原始数据类型如何），需根据需求转换为目标类型，常见转换方式如下：
- 列表、字典、集合等数据结构：使用 `ast.literal_eval()` 转换
- 数字：使用 `float()` 或 `int()` 转换
- 布尔值：使用 `bool()` 转换


### 11. 如何解读奖励图表？（How do I interpret my reward graphs?）
“奖励图表（Reward Graphs）”标签页包含多个核心图表，各图表解读方式如下：
- **`total_reward`（总奖励）**：展示所有奖励函数组合后的平均总奖励，上升趋势表明模型在优化既定奖励目标
- **`total_reward_std`（总奖励标准差）**：反映模型在不同示例中性能的一致性，随训练推进应逐渐下降（表明性能更稳定）
- **各奖励函数独立图表**：每个奖励函数对应单独图表，展示模型对该特定目标的学习进度（图表值为某训练步骤下该函数在所有补全结果中的平均奖励，如 `format_reward_func`（格式奖励函数）、`correctness_reward_func`（正确性奖励函数）的图表）

**解读关键要点**：
- 核心关注整体上升趋势（标准差图表除外，应呈下降趋势），且进展可能非线性
- 通常需 40-50 个训练步骤后才会出现明显改进迹象
- 格式相关奖励（如正确的 JSON 结构）通常先于复杂任务特定奖励提升
- 训练初期高方差（图表波动剧烈）属正常现象，应随时间逐渐降低
- 若某奖励函数图表持续平稳或下降，需先通过“奖励日志（Reward Logs）”标签页排查明显问题，再调整该函数实现


### 12. 如何使用奖励日志标签页？（How do I use the reward logs tab?）
“奖励日志（Reward Logs）”标签页会显示训练期间奖励函数中的所有打印语句，是核心调试与监控工具，主要用途包括：
1. 跟踪训练进度：显示正在执行的奖励函数，以及对应的步骤和轮次编号
2. 记录奖励分数：在返回奖励分数前，打印分配给补全结果的分数
3. 调试函数问题：通过查看日志输出，定位奖励函数实现中的错误
4. 监控性能异常：跟踪 API 超时、错误等性能问题
5. 分析分数异常：排查奖励分数趋于平稳或出现意外波动的原因


### 13. 如何使用补全结果标签页？（How do I use the completions tab?）
“补全结果（Completions）”标签页提供模型训练期间实际生成内容的详细视图，使用步骤与功能如下：

#### （1）选择提示词（Select a Prompt）
通过提示词选择表格从训练集中筛选目标提示词，表格包含以下信息：
- 提示词索引（Prompt Index）：每个提示词的唯一标识
- 提示词文本（Prompt Text）：展示给模型的实际提示内容
- 提示词长度（Prompt Length）：提示词包含的令牌（token）数量
- 附加列（Additional Columns）：与提示词一同提供的额外元数据或上下文
- 轮次（Epoch）：使用该提示词的训练轮次
- 总补全数（Total Completions）：为该提示词生成的补全结果总数

#### （2）比较补全结果（Compare Completions）
此部分支持并排对比两个补全结果，核心功能包括：
- 默认右侧列显示“最新轮次生成的最佳补全结果”，左侧列可选择同一提示词在任意轮次的其他补全结果
- 通过滑块选择左侧列的目标轮次，通过箭头切换该轮次下的不同补全结果
- 每列均展示补全文本、所有单独奖励分数及总奖励
- 支持对比任意两个补全结果（不限于与最新轮次最佳结果对比）

#### （3）查看所有补全结果（View all completions）
展示为所选提示词生成的所有补全结果详情，包含：
- 轮次（Epoch）：生成该补全结果的训练轮次
- 补全内容（Completion）：模型输出的完整文本
- 单独奖励分数（Individual reward scores）：每个奖励函数对应的分数（如 `format_reward_func_v1` 列）
- 总奖励（Total）：所有奖励函数分数的总和
- 长度（Length）：补全内容包含的令牌数量
- 查看按钮（View）：在“比较补全结果”部分展示该补全内容

#### （4）核心用途
- 验证奖励分数与输出质量的关联性（确认高分对应高质量输出）
- 检测奖励作弊（模型钻奖励函数漏洞的行为）
- 跟踪响应随训练的演变过程
- 定位需优化的奖励函数方向
- 识别训练过程中的性能突破时刻
- 验证输出格式与结构的正确性


### 14. 如何控制 GRPO 训练运行的长度？（How do I control the length of my GRPO training run?）
- 默认 GRPO 训练运行 1000 个步骤，可通过 `GRPOConfig` 中的 `train_steps` 参数修改该设置
- 建议：多数情况下不建议将 `train_steps` 设为 500 以下，因 GRPO 需一定步骤才能实现收敛


### 15. 还有其他建议吗？（Any additional tips?）
- 建议至少配置两类奖励函数：一是“格式奖励函数”（确保模型按期望格式响应），二是“正确性奖励函数”（判断答案或预期输出的质量），两类函数结合可兼顾输出规范性与有效性


## 九、后续步骤（Next Steps）
1. 探索[用例（Use Cases）]()
2. 了解[生产部署（Production Deployment）]()
3. 查阅[强化学习文档（Reinforcement learning documentation）]()
