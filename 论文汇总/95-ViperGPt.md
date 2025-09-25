
马东锡 NLP
@dongxi_nlp
·
Mar 29, 2023
1/ 有趣论文分享

ViperGPT: Visual Inference via Python Execution for Reasoning

这是一篇简单的大模型组合胶水文章，但作者脑回路十分清奇：

把自然语言的问题（query）生成python 代码来解决现实的视觉推理。

读罢，不禁感想，如果代码可以描绘一切，那么这个世界有可能是代码生成的么？

2 / 此论文完成了codex下架之前🥲

目的是解决视觉推理问题，比如通过判断一个图片中不同的实体及其数量，算简单的数学问题。

作者通过把function signature和docstrings当作context，连同query一起promptingLLM生成带有视觉预训练模型api的代码。

<img width="894" height="293" alt="image" src="https://github.com/user-attachments/assets/f5bb3752-a876-4bc1-af01-58e9ccc44e6e" />



马东锡 NLP
@dongxi_nlp
·
Mar 29, 2023
3/ 值得一提的是，这种prompting的方式非常smart！

function signature天然包括了api名称以及输入输出type，而docstrings包含了执行实际的例子。因而避免了在prompt message中嵌入冗长的代码的具体实现。


<img width="1089" height="505" alt="image" src="https://github.com/user-attachments/assets/3ef5c56b-8223-4979-9b7d-fb963099a224" />

马东锡 NLP
@dongxi_nlp
·
Mar 29, 2023
4/ 生成的代码包含了对各种预训练cv模型api的调用，例如识别，分割，最终解决视觉推理问题。

这个清奇的思路似乎把人类自然语言反编译为源代码，让代码解决代码问题。

<img width="576" height="307" alt="image" src="https://github.com/user-attachments/assets/b9b4aff8-6886-4c39-ab15-c763ff0acb80" />

https://github.com/cvlab-columbia/viper


马东锡 NLP
@dongxi_nlp
·
Mar 29, 2023
6/ 论文链接

https://arxiv.org/abs/2303.08128














