### Search-R1 源码核心内容整理
#### 奖励分配机制
- **多轮交互中的奖励分配**
  - **多轮生成流程**
    1. 第1轮: 问题 → LLM生成`<search>query</search>` → 搜索执行 → 结果注入
    2. 第2轮: 问题+搜索结果 → LLM生成`<answer>result</answer>` → 奖励分配
  - **关键特点**
    - ✨不立即奖励搜索动作：搜索本身不直接获得奖励
    - ✨最终答案驱动：奖励完全基于最终答案的正确性
    - ✨状态累积：每轮搜索结果都会累积到对话历史中
- **分层奖励体系**
  - **判断优先级**
    - ✨答案正确性：最高优先级（0.8 - 1.0分）
    - 格式正确性：中等优先级（0.2 - 0.3分）
    - 搜索正确性：额外奖励（+0.1分）
  - **奖励分配矩阵**
    | 格式正确 | 搜索正确 | 答案正确 | 奖励分数 |
    | -------- | -------- | -------- | -------- |
    | ☑️       | ☑️       | ☑️       | 1.0      |
    | ☑️       | ☑️       | ❌       | 0.3      |
    | ☑️       | ❌       | ❌       | 0.2      |
    | ❌       | -        | ☑️       | 0.8      |
    | ❌       | -        | ❌       | 0.1      |
    | -        | -        | 无答案   | 0.0      |
  - **源代码**
    ```python
    # 奖励分配规则
    if answer is None:  # 没有答案
        if is_valid_format:
            if retrieval_correct:
                return 0.3  # 格式+搜索正确
            else:
                return 0.2  # 仅格式正确
        else:
            return 0.0  # 格式错误
    else:  # 有答案
        if em_check(answer, ground_truth):  # 答案正确
            if is_valid_format:
                return 1.0  # 完美回答
            else:
                return 0.8  # 答案正确但格式错误
        else:  # 答案错误
            if is_valid_format:
                if retrieval_correct:
                    return 0.3  # 格式+搜索正确
                else:
                    return 0.2  # 仅格式正确
            else:
                return 0.1  # 格式和答案都错误
    ```
#### 判断逻辑
- **格式正确性判断(`is_valid_sequence`)**
  - **基本要求**
    - ✨必须包含assistant标记: `<|im_start|>assistant`
    - ✨标签平衡性：所有标签必须成对出现
    - ✨序列正确性：必须按照特定顺序排列
  - **状态机验证**
    允许的状态转换路径：
    `start → in_think → after_think → in_search → after_search → in_information → in_answer → end`
    **关键规则**：
    - ``只能在`start`或`information`状态后出现
    - `<search>`只能在`after_think`状态后出现
    - `<information>`只能在`after_search`状态后出现
    - `<answer>`只能在`after_think`状态后出现
  - **内容有效性**
    - ✨内容只能在标签内部存在
    - ✨标签之间只能有空白字符
    - ✨不允许在标签外有额外内容
- **搜索正确性判断(`is_retrieval_correct`)**
  - **信息块提取**
    ```python
    def extract_information_blocks(text: str) -> list[str]:
        pattern = r"<information>(.*?)</information>"
        matches = re.findall(pattern, text, re.DOTALL)
        return [match.strip() for match in matches]
    ```
  - **搜索质量评估**
    ```python
    def is_retrieval_correct(text: str, golden_answers: list[str]) -> bool:
        seqs = extract_information_blocks(text)  # 提取所有<information>块
        for seq in seqs:
            for golden_answer in golden_answers:
                # 检查搜索结果中是否包含正确答案
                if normalize_answer(golden_answer) in normalize_answer(seq):
                    return True
        return False
    ```
    **判断逻辑**：
    - ✨提取所有`<information>`块的内容
    - ✨检查任意一个信息块是否包含正确答案
    - ✨支持多轮搜索（多个信息块）
- **答案正确性判断(`em_check`)**
  - **答案提取**
    ```python
    def extract_solution(solution_str):
        answer_pattern = r"<answer>(.*?)</answer>"
        match = re.finditer(answer_pattern, solution_str, re.DOTALL)
        matches = list(match)

        # 如果只有0个或1个匹配，返回None
        if len(matches) <= 1:
            return None

        # 如果有2个或更多匹配，返回最后一个
        return matches[-1].group(1).strip()
    ```
  - **答案标准化**
    ```python
    def normalize_answer(s):
        def remove_articles(text):
            return re.sub(r"\b(a|an|the)\b", " ", text)

        def white_space_fix(text):
            return " ".join(text.split())

        def remove_punc(text):
            exclude = set(string.punctuation)
            return "".join(ch for ch in text if ch not in exclude)

        def lower(text):
            return text.lower()

        return white_space_fix(remove_articles(remove_punc(lower(s))))
    ```
  - **精确匹配**
    ```python
    def em_check(prediction, golden_answers):
        normalized_prediction = normalize_answer(prediction)
        for golden_answer in golden_answers:
            golden_answer = normalize_answer(golden_answer)
            if golden_answer == normalized_prediction:
                return 1
        return 0
    ```
    **标准化处理**：
    - ✨转换为小写
    - ✨移除标点符号
    - ✨移除冠词（a, an, the）
    - ✨标准化空格
#### Token参与与Loss计算
- **Token参与与Loss计算的基本原理**
  - **核心概念**
    Search - R1中只有response部分的token参与loss计算：
    ```python
    完整序列 = [Prompt] + [Response]
    参与Loss = 只有[Response]部分的token
    ```
  - **关键掩码机制**
    - **Response Mask (`response_mask`)**：
      ```python
      response_length = responses.size(1)
      response_mask = attention_mask[:, -response_length:]  # 只取response部分
      ```
    - **Loss Mask (`loss_mask`)**：
      ```python
      # 如果启用state_masking，使用info_mask
      if self.config.state_masking:
          response_mask = data['loss_mask']  # 使用info_mask
      else:
          response_mask = attention_mask[:, -response_length:]  # 使用attention_mask
      ```
- **不同Token类型的参与情况**
  - **标准情况（无State Masking）**
    所有Response Token都参与：
    - ✨思考Token（`...`）：参与loss计算
    - ✨搜索Token（`<search>...</search>`）：参与loss计算
    - ✨信息Token（`<information>...</information>`）：参与loss计算
    - ✨答案Token（`<answer>...</answer>`）：参与loss计算
  - **State Masking情况**
    只有特定Token参与：
    - ✨思考Token：参与loss计算
    - ✨搜索Token：参与loss计算
    - ❌信息Token：不参与loss计算（被`info_mask`屏蔽）
    - ✨答案Token：参与loss计算
- **Advantage值的分配机制**
  - **奖励分配策略**
    **关键特点**：只在最后一个token分配奖励
    ```python
    # 在main_ppo.py中
    score = compute_score_fn(solution_str=sequences_str, ground_truth=ground_truth)
    reward_tensor[i, valid_response_length - 1] = score  # 只在最后一个token
    ```
  - **GAE Advantage计算**
    **Advantage传播机制**：
    1. ✨最后一个token：获得实际奖励值
    2. 前面的token：通过GAE算法获得传播的advantage值
    3. 传播公式：\( A_t = \delta_t + \gamma\lambda A_{t + 1} \)
  - **GRPO Advantage计算**
    **GRPO特点**：
    - ✨所有参与loss计算的token获得相同的advantage值
    - ✨基于同一prompt的多个response的相对表现
    - ✨适用于结果监督场景
