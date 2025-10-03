https://verl.readthedocs.io/en/latest/algo/grpo.html?utm_source=chatgpt.com

# Group Relative Policy Optimization (GRPO) 网页总结
## 一、网页整体框架
该网页是 verl 框架的文档页面，围绕强化学习相关内容展开，核心聚焦于群体相对策略优化（GRPO）算法，同时涵盖框架使用的多方面指导，整体结构清晰，分为多个核心模块，具体如下：
|模块类别|包含内容|
| ---- | ---- |
|基础入门|快速开始（安装、PPO在GSM8K数据集训练、多节点训练等）|
|开发指南|混合流编程指南、`verl.single_controller`设计|
|数据与配置|数据准备（训练后数据准备、数据集奖励函数实现）、配置说明|
|算法相关|PPO示例（架构、GSM8K示例等）、多种算法（GRPO、DAPO、SPIN等）、算法基准|
|训练与模型|PPO训练器和工作器（不同后端支持）、新增模型方法|
|性能与进阶|性能调优指南、高级特性（ checkpoint 容错、多轮滚动支持等）|
|硬件与参考|硬件支持（AMD、Ascend设备）、API参考、FAQ、开发笔记|

## 二、GRPO 核心内容
### （一）算法定义与优势
- **定义**：GRPO 是一种强化学习算法，在传统算法（如 PPO）基础上简化流程，无需单独训练“评论家”模型，通过群体抽样、奖励分配、基线计算和策略更新四个步骤实现模型优化。
- **优势**：避免训练单独的价值估计模型，减少计算开销，提升学习过程效率，尤其适用于对资源消耗敏感的场景。

### （二）关键组件
1. **无价值函数（无评论家）**：与 PPO 不同，GRPO 不训练单独的价值网络，省去相关训练成本与资源消耗。
2. **群体采样（分组滚动）**：针对每个输入提示，从当前策略生成多个补全内容（响应）形成“群体”，而非仅评估一次滚动，丰富样本多样性。
3. **相对奖励**：在每个群体内，依据正确性等标准对补全内容评分，并基于群体进行奖励归一化，使奖励更具针对性与可比性。

### （三）配置参数
GRPO 配置参数部分虽多以`ppo_`为前缀，但可在 verl 框架不同 RL 算法中通用，核心参数及说明如下：
|参数名|功能说明|默认值/建议值|
| ---- | ---- | ---- |
|`actor_rollout.ref.rollout.n`|每个提示的采样次数，GRPO 需设为大于1以实现群体采样|默认1，GRPO建议>1|
|`data.train_batch_size`|生成采样轨迹的提示全局批次大小，响应数=该值×`actor_rollout.ref.rollout.n`|无默认，按需设置|
|`actor_rollout_ref.actor.ppo_mini_batch_size`|采样轨迹拆分的迷你批次大小（全局跨工作器）|无默认，按需设置|
|`actor_rollout_ref.actor.ppo_epochs`|一组采样轨迹上 GRPO 更新的轮次|无默认，按需设置|
|`actor_rollout_ref.actor.clip_ratio`|GRPO 裁剪范围|0.2|
|`algorithm.adv_estimator`|优势估计器，GRPO 需设为“grpo”|默认“gae”，GRPO设为“grpo”|
|`actor_rollout_ref.actor.loss_agg_mode`|损失聚合模式，verl 中 GRPO 示例默认“token-mean”，原论文用“seq-mean-token-mean”（长CoT场景不稳定）|默认“token-mean”，可选其他模式|
|`actor_rollout_ref.actor.use_kl_loss`|是否在演员网络中使用KL损失（GRPO需开启，且不在奖励函数中加KL惩罚）|默认False，GRPO设为True|
|`actor_rollout_ref.actor.kl_loss_coef`|KL损失系数|0.001|
|`actor_rollout_ref.actor.kl_loss_type`|KL散度计算方式，支持kl(k1)、abs等，可加“+”实现无偏梯度估计|无默认，按需选择|

### （四）高级扩展（DrGRPO）
- **背景**：有研究指出 GRPO 存在优化偏差，易导致响应人为变长（尤其错误输出），源于基于群体的奖励归一化计算优势的方式。
- **改进方式**：DrGRPO 通过全局常数归一化聚合token级损失，消除长度偏差。
- **配置要求**：需将`actor_rollout_ref.actor.loss_agg_mode`设为“seq-mean-token-sum-norm”、`actor_rollout_ref.actor.use_kl_loss`设为False、`algorithm.norm_adv_by_std_in_grpo`设为False，其他参数与 GRPO 一致。

### （五）参考示例
- **训练命令**：提供 Qwen2.5 GRPO 训练脚本，命令为`bash examples/grpo_trainer/run_qwen3-8b.sh`，可直接执行启动训练。
- **性能参考**：更多参考性能可查看链接 https://verl.readthedocs.io/en/latest/algo/baseline.html 。

## 三、其他补充信息
- **文档更新时间**：GRPO 相关内容最后更新于2025年5月31日，确保信息时效性。
- **版权与技术支持**：文档版权归2024年字节跳动种子基金会 MLSys 团队所有，基于 Sphinx 构建，使用 Read the Docs 提供的主题，可通过相关链接获取项目主页、构建信息等。
- **广告提示**：页面包含 EthicalAds 广告，可关闭，不影响核心文档内容阅读。
