
马东锡 NLP
@dongxi_nlp
·
Mar 31, 2023
1/ 论文分享
HuggingGPT: Solving AI Tasks with ChatGPT and its Friends in HuggingFace

昨天在
@tinyfool
 的space聊到，用chatGPT处理文字的简单任务已经oldschool，把chatGPT作为coordinator，来协调多种大模型API来完成多模态复杂任务已成为趋势。

不到24小时，已看到对应文章，HuggingGPT。

<img width="1200" height="550" alt="image" src="https://github.com/user-attachments/assets/c0cb0f2b-29c3-4d9f-b8fb-4f14a6d67a42" />


6/ 代码 还未完全发布，但感兴趣的大家可以跟踪一下
https://github.com/microsoft/JARVIS


https://arxiv.org/abs/2303.17580


马东锡 NLP
@dongxi_nlp
·
Mar 31, 2023
4/ 解析用户输入和模型选择
作者通过few-shot 的in context learning，用chatGPT将用户端的自然语言输入转为预设的planning template。

Huggingface Hub上有大量的open source的针对于某项任务的专家模型，并且有着详细的自然语言形态的模型说明书。这给了根据template匹配模型的可能。

<img width="900" height="847" alt="image" src="https://github.com/user-attachments/assets/6e88838f-02b2-4ff1-9158-ef8d572ecd87" />

东锡 NLP
@dongxi_nlp
·
Mar 31, 2023
5/ 通常来说，代码是一部分人类后天精心设计的，而并非是通过长期自然的演变而形成，所以不被认为是自然语言。

但随着code不断丰富着nlp的语料库，以及nlp任务中越来越多的涉及对code的处理，code和人类自然语言之间的界限开始模糊。

未来，对code和人类语言综合处理，一定会带来功能更加高级的应用













