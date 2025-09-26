### pdd算法面经

#### 1. 自我介绍（结合工作经历）
**回答要点**：
- 简要介绍教育背景和专业方向
- 重点突出与大模型/算法相关的工作/项目经历
- 提及技术栈和研究成果
- 表达对当前岗位的兴趣和匹配度

**示例**："我是XXX，毕业于XXX大学，主要研究方向自然语言处理。曾在XXX公司参与大模型训练优化工作，负责过SFT流程设计和AI Agent开发，在模型调优和分布式训练方面有实践经验..."

#### 2. SFT中的scaling law了解吗？训练中遇到的困难？
**Scaling Law理解**：
- **模型规模**：参数量增加带来性能提升的规律
- **数据规模**：训练数据量与模型效果的对应关系
- **计算最优**：计算预算在模型大小和训练token数间的分配

**实际训练困难**：
- **过拟合**：小规模SFT数据容易导致模型遗忘预训练知识
- **灾难性遗忘**：微调后模型通用能力下降
- **数据质量**：标注不一致、噪声数据影响效果
- **超参敏感**：学习率、批大小等参数需要精细调优
- **评估困难**：缺乏有效的自动化评估指标

#### 3. advantage或loss突然变成0的原因分析
**可能原因**：
- **梯度爆炸/消失**：梯度异常导致参数更新失效
- **数值溢出**：fp16训练中的inf/nan问题
- **奖励模型失效**：RM输出全为0或常数
- **策略坍塌**：模型收敛到单一动作，失去探索性
- **数据问题**：训练数据中存在大量无效样本
- **超参设置**：学习率过大/过小，clip范围不合理

**解决方案**：
- 添加梯度裁剪、损失缩放
- 检查数据预处理流程
- 监控训练过程中的数值稳定性
- 调整奖励模型的训练策略

#### 4. AI Agent的记忆机制设计
**记忆模块组成**：
```python
class MemorySystem:
    def __init__(self):
        self.short_term = []  # 短期记忆（当前会话）
        self.long_term = {}   # 长期记忆（向量数据库）
        self.working_memory = []  # 工作记忆（当前任务相关）
    
    def store_short_term(self, observation, action, reward):
        """存储短期交互记忆"""
        self.short_term.append({
            'obs': observation,
            'act': action, 
            'rew': reward,
            'timestamp': time.time()
        })
    
    def retrieve_relevant(self, query, k=5):
        """基于相似度检索相关记忆"""
        query_embedding = get_embedding(query)
        similarities = []
        for key, memory in self.long_term.items():
            sim = cosine_similarity(query_embedding, memory['embedding'])
            similarities.append((sim, memory))
        
        return sorted(similarities, reverse=True)[:k]
```

**记忆类型**：
- **短期记忆**：当前对话上下文，有限容量
- **长期记忆**：重要经验，向量化存储+检索
- **工作记忆**：任务相关信息的临时保持
- **情景记忆**：具体事件的时间、地点、内容

#### 5. bad case分析与改进措施
**分析流程**：
1. **分类归因**：
   - 数据问题：噪声、标注错误、分布偏差
   - 模型问题：能力不足、过拟合、偏差
   - 任务定义：指令不清晰、评估标准不合理

2. **根因分析**：
   - 检查训练数据中相似样本的表现
   - 分析注意力权重分布
   - 对比不同模型版本的表现

**改进措施**：
- **数据层面**：补充困难样本、数据增强、去噪清洗
- **模型层面**：调整损失函数、添加正则化、多任务学习
- **训练策略**：课程学习、对抗训练、集成学习

#### 6. 特定领域Embedding训练方案
**训练流程**：
```python
def train_domain_embedding(domain_texts):
    # 1. 数据准备
    corpus = preprocess_domain_texts(domain_texts)
    
    # 2. 对比学习目标
    model = ContrastiveBERT(
        model_name='bert-base',
        margin=0.2,
        temperature=0.05
    )
    
    # 3. 领域自适应预训练
    model.domain_adaptive_pretrain(corpus)
    
    # 4. 有监督微调（如有标注数据）
    if labeled_data:
        model.supervised_finetune(labeled_data)
    
    return model
```

**关键技术**：
- **领域继续预训练**：在领域文本上MLM训练
- **对比学习**：构建正负样本对学习语义相似度
- **难样本挖掘**：自动识别困难负样本提升效果
- **多粒度训练**：词级、句级、文档级联合优化

#### 7. 团队组成与协作方式
**典型团队结构**：
- **算法研究员**：模型创新、算法设计
- **算法工程师**：模型实现、训练优化
- **数据工程师**：数据收集、清洗、标注
- **后端工程师**：服务部署、性能优化
- **产品经理**：需求分析、效果评估

**协作流程**：
1. **需求分析**：产品提出需求，算法评估可行性
2. **数据准备**：数据团队收集清洗，算法验证质量
3. **实验迭代**：算法设计→实现→训练→评估循环
4. **上线部署**：工程化封装，AB测试验证效果
5. **监控优化**：线上监控，持续迭代改进

#### 8. 大模型分布式训练底层理解
**并行策略对比**：
| 并行方式 | 通信特点 | 适用场景 | 优势 |
|---------|---------|---------|------|
| **数据并行(DP)** | 梯度AllReduce | 数据量大、模型可单卡放下 | 实现简单 |
| **张量并行(TP)** | 层内AllGather | 单层参数超过单卡显存 | 内存优化 |
| **流水并行(PP)** | 点对点通信 | 模型层数多、深度大 | 扩展性强 |
| **混合并行** | 多种组合 | 超大规模模型训练 | 灵活高效 |

**Megatron核心思想**：
- **模型切分**：将Transformer层按注意力头/MLP维度切分
- **通信优化**：重叠计算和通信，减少等待时间
- **内存管理**：激活检查点、CPU offload等技术

#### 9. 核心代码模式算法题：二维数组中的查找
**题目描述**：在行和列都按升序排列的二维数组中高效查找目标值。

**解决方案**：
```python
def search_matrix(matrix, target):
    """
    :type matrix: List[List[int]]
    :type target: int
    :rtype: bool
    """
    if not matrix or not matrix[0]:
        return False
    
    m, n = len(matrix), len(matrix[0])
    # 从右上角开始搜索
    row, col = 0, n - 1
    
    while row < m and col >= 0:
        if matrix[row][col] == target:
            return True
        elif matrix[row][col] > target:
            # 当前值太大，向左移动
            col -= 1
        else:
            # 当前值太小，向下移动
            row += 1
    
    return False

# 测试用例
matrix = [
    [1,   4,  7, 11, 15],
    [2,   5,  8, 12, 19],
    [3,   6,  9, 16, 22],
    [10, 13, 14, 17, 24],
    [18, 21, 23, 26, 30]
]

print(search_matrix(matrix, 5))  # True
print(search_matrix(matrix, 20)) # False
```

**算法复杂度**：
- 时间复杂度：O(m + n)
- 空间复杂度：O(1)

**算法思路**：
利用矩阵有序特性，从右上角开始：
- 等于target：找到目标，返回True
- 大于target：说明当前列都太大，左移一列
- 小于target：说明当前行都太小，下移一行

这种方法每次排除一行或一列，逐步缩小搜索范围。
