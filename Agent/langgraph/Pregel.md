https://github.com/langchain-ai/langgraph/blob/main/docs/docs/concepts/pregel.md

# LangGraph Pregel 运行时文档总结
## 一、Pregel 运行时核心定位
1. **本质**：LangGraph 的底层运行时，负责管理 LangGraph 应用的执行流程，名称源自 Google 的 Pregel 算法（用于大规模图并行计算）
2. **生成方式**：通过编译 `StateGraph`（图 API）或创建 `entrypoint`（函数式 API）自动生成 Pregel 实例，支持直接传入输入数据调用（`invoke` 方法）
3. **核心组成**：由「Actors（节点）」和「Channels（通道）」构成，Actors 从 Channels 读取数据、处理后写入 Channels，形成数据流转闭环


## 二、Pregel 执行模型（Bulk Synchronous Parallel 模型）
执行流程按「步骤（Step）」循环，每步包含 3 个阶段，直至无 Actors 需执行或达到最大步骤数：
1. **Plan（规划阶段）**：确定当前步骤需执行的 Actors  
   - 初始步骤：选择订阅「输入通道（input channels）」的 Actors  
   - 后续步骤：选择订阅「上一步更新过的通道」的 Actors
2. **Execution（执行阶段）**：并行执行所有选中的 Actors  
   - 执行期间，Actors 对通道的更新对其他 Actors 不可见（隔离性），直至进入 Update 阶段
3. **Update（更新阶段）**：将 Actors 执行产生的结果统一写入对应通道，完成通道值更新


## 三、核心组件详解
### （一）Actors（节点）
1. **定义**：即 `PregelNode`，实现 LangChain 的 Runnable 接口，是数据处理的核心单元
2. **核心能力**：
   - 订阅通道（单通道用 `subscribe_only`，多通道用 `subscribe_to`）
   - 处理数据（通过 `do` 方法定义处理逻辑，如字符串翻倍、自定义计算）
   - 写入通道（通过 `write_to` 方法指定输出通道）


### （二）Channels（通道）
用于 Actors 间数据通信，每个通道有明确的「值类型」「更新类型」和「更新函数」，LangGraph 提供 3 种核心内置通道：

| 通道类型               | 核心功能                                                                 | 适用场景举例                          |
|------------------------|--------------------------------------------------------------------------|---------------------------------------|
| `LastValue`            | 存储最后一次写入的值，覆盖旧值，为默认通道                               | 节点间传递中间结果、输入输出值存储    |
| `Topic`                | 基于 PubSub 机制的可配置通道，支持去重、多步骤值累积（`accumulate=True`） | 收集多个节点/多步骤的原始输出（如列表形式） |
| `BinaryOperatorAggregate` | 维护持久值，通过自定义二元运算符（如 `add`、自定义 `reducer`）合并新值    | 多步骤数据聚合（如求和、字符串拼接）  |
| `EphemeralValue`       | 临时存储值，易被覆盖/清空，非持久化                                     | 临时输入通道、单次使用的中间通道      |


## 四、Pregel 应用示例（Python/JS 逻辑一致）
### 1. 单节点示例
- **场景**：单个节点处理输入字符串，实现字符串翻倍
- **核心逻辑**：输入通道 `a` 接收初始值（如 "foo"），节点 `node1` 读取后翻倍，写入输出通道 `b`
- **输出结果**：`{'b': 'foofoo'}`

### 2. 多节点串联示例
- **场景**：两个节点串联，依次处理数据（先翻倍再翻倍）
- **核心逻辑**：`node1` 处理输入写入 `b` 通道（`LastValue` 类型，确保 `node2` 可读取），`node2` 读取 `b` 通道值再次翻倍，写入 `c` 通道
- **输出结果**：`{'b': 'foofoo', 'c': 'foofoofoofoo'}`

### 3. Topic 通道示例
- **场景**：收集两个节点的输出，以列表形式保留所有原始值
- **核心逻辑**：`node1` 写入 `b` 通道和 `c` 通道（`Topic` 类型，`accumulate=True`），`node2` 读取 `b` 通道后写入 `c` 通道，`c` 通道累积所有结果
- **输出结果**：`{'c': ['foofoo', 'foofoofoofoo']}`

### 4. BinaryOperatorAggregate 通道示例
- **场景**：自定义聚合逻辑合并多节点输出（如用 "|" 连接字符串）
- **核心逻辑**：定义 `reducer` 函数实现字符串连接，`node1` 和 `node2` 分别写入 `c` 通道（`BinaryOperatorAggregate` 类型），自动调用 `reducer` 合并值
- **输出结果**：`{'c': 'foofoo | foofoofoofoo'}`

### 5. 循环示例
- **场景**：单个节点自循环处理数据，直至满足停止条件
- **核心逻辑**：节点订阅并写入同一通道（`value`），处理逻辑为「长度<10 则翻倍，否则返回 None」，配置 `skip_none=True`（None 不写入通道，终止循环）
- **输出结果**：`{'value': 'aaaaaaaaaaaaaaaa'}`（长度达 16，满足停止条件）


## 五、高层 API（简化 Pregel 应用开发）
无需手动配置节点和通道，专注业务逻辑，自动生成 Pregel 实例：

### （一）StateGraph（图 API）
1. **特点**：通过节点、边定义图结构，编译后自动生成 Pregel 实例
2. **核心步骤**：
   - 定义状态结构（如 `Essay` 类型，包含 `topic`/`content`/`score`）
   - 用 `add_node` 添加处理节点（如 `write_essay` 生成作文内容，`score_essay` 评分）
   - 用 `add_edge` 定义节点流转关系（如从 `START` 到 `write_essay`）
   - 调用 `compile` 方法生成 Pregel 实例

### （二）Functional API（函数式 API）
1. **特点**：通过 `entrypoint` 装饰器（Python）或函数（JS）包装处理函数，自动生成 Pregel 应用
2. **核心步骤**：
   - 定义数据结构（如 `Essay` 接口）
   - 创建检查点（如 `InMemorySaver`，用于保存执行状态）
   - 用 `entrypoint` 包装处理函数（如 `write_essay`），自动生成节点和默认通道（`__start__` 输入、`__end__` 输出、`__previous__` 状态）


## 六、关键补充
1. **检查点（Checkpointer）**：如 `InMemorySaver`（内存存储），用于保存应用执行状态，支持中断后恢复、历史记录追踪，函数式 API 需显式配置
2. **输入输出**：通过 `input_channels` 指定输入通道，`output_channels` 指定输出通道，调用 `invoke` 时传入输入数据，返回输出通道的最终值
3. **语言支持**：提供 Python 和 TypeScript 两种实现，核心逻辑一致，仅语法差异（如 Python 用 `subscribe_only`，JS 用 `subscribeOnly`；JS 需 `await` 异步调用 `invoke`）
