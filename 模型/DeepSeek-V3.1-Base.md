
karminski-牙医
@karminski3
·
Aug 20
一图了解 DeepSeek-V3.1-Base 都更新了啥！

几个小时前 DeepSeek 正式发布了 DeepSeek-V3.1-Base，模型卡目前还没上传，所以看不到性能数据，我直接查看了模型配置文件和词汇表等数据，给大家做了个深度解析~ 让大家一图看懂这次DeepSeek-V3.1-Base 都更新了啥！

文字总结这次 DeepSeek-V3.1-Base 更新的4个要点：

- 这是一个 Hybrid-Model, 可以开关思考模式, 不知道 DeepSeek 是怎么考虑的, Qwen 通过社区验证已经放弃了 Hybrid-Model, Qwen3 的数据显示, 混合模型在非推理任务上的性能损失非常严重. 而 DeepSeek 则推出了 Hybrid-Model. 会不会 DeepSeek 找到了一种方法, 让 Hybrid-Model 更强?

- 另外新增了原生 search token 的支持, 这意味着搜索的支持更好. 我特意去看了下, R1 也没有这个 token, 所以应该是为了原生支持搜索而新启用的 token. 而不是为了统一 V3 和 R1 的词汇表. 目前社区返回搜索触发率特别高, 除非明确提示它不要搜索. 不过我估计应该有开关, 因为目前模型卡还没放出来, 我这个报告写于 2025-08-20 04:50, 估计没准等到10点 DeepSeek上班了他们就上传模型卡告诉大家怎么关闭了. 如果真的没有关闭的选项, 这可能非常糟糕...

- 编程能力可能特别强, 从社区中拿 Aider 来测的数据看, 直接就开放权重模型第一名了.
 
- 上下文长度其实没变, 旧版 DeepSeek-V3-Base 也是 128K.

<img width="1468" height="4096" alt="image" src="https://github.com/user-attachments/assets/36c00623-f97c-45bd-903a-a500502f6920" />
