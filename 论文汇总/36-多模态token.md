「Token」多模态token分析

看到一个苹果，我们会自然想到它的名字、味道、和意义，感官和语言在脑中一起被唤起。

最近看了很多 multimodal reasoning 论文，也几乎每天用 GPT-4o 生成图片。一个问题便浮现：

在大模型里，多模态 token 是什么形态？视觉 token 跟语言 token 的联系与区别在哪？

举个栗子：用户上传一张图片并提问这张图里有几只猫，在大模型端，完整的序列如下：

<|im_start|>user 
<|vision_start|>  [v₁ … vₙ]  <|vision_end|> 
请回答：这张图里有几只猫？
<|im_end|>
<|im_start|>assistant

- 其中<vision_start> ， <vision_end> 是 特殊 token，在词表中有自己的 ID（如附图：151653、151654）。
- [v₁ … vₙ] 由 ViT 模块对图片切 patch 后计算得到的 连续向量序列。

1. Tokenizer 阶段：文本 vs. 视觉走两条完全不同的链路

在 <vision_start> 与 <vision_end> 之间会填入 n 个占位符 ID（如图  <|image_pad|>， 151655 ） ：151653, 151655 × n, 151654。

随后在 数据整理/前向过程里，把这些占位符的词向量整批替换为 ViT 生成的 [v₁…vₙ] 连续向量

所以文本token和视觉token的区别在于：
文本 token 化＝离散 -> 查词表
视觉 token 化＝连续 -> 由专门的模块计算patch token

2. 放进 Transformer 后：共享“语义空间”
所有 token（文本和视觉）被映射到同一 d_model 维度
-> 可以彼此 self-attention，完成跨模态融合。

这种处理方式让语言 token 与视觉 token 在同一注意力空间中互动，类似人类看到苹果时“味道 + 名字 + 意义”同时被激活的通感体验。

明白了这个过程，从语言生成图片，也就是同样的逻辑了！

<img width="1200" height="1109" alt="image" src="https://github.com/user-attachments/assets/9a470ad4-be52-4949-9f5c-e4349be742b2" />
