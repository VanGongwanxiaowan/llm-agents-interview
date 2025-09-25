1/ 在OpenAI发布plugin后，后知后觉地意识到了toolformer这篇论文的重要性，于是重读了论文，把一些读后感做个thread

看到其他推友如
@Tisoga
 也写过类似的总结，深入浅出的分析了toolfomer可以干什么。

此thread从language modeling的角度，通俗地谈一下toolformer是如何做到学会使用工具的。


马东锡 NLP
@dongxi_nlp
·
Mar 25, 2023
2/ 首先我们看一下OpenAI plugin文档，一个重要的bullet：
“perform actions on behalf of the users”

具体逻辑
开发者按标准化manifest file写specific，包括api endpoints， examples和自然语言的description。
当用户激活plugin进入对话，manifest的信息会给chatgpt，然后根据用户问题，call api

<img width="860" height="776" alt="image" src="https://github.com/user-attachments/assets/159303e7-5fce-49c2-8cc1-1e5238632b2b" />


马东锡 NLP
@dongxi_nlp
·
Mar 25, 2023
3/ 这恰好是toolformer这篇论文做的事情，即训练语言模型学会使用api。

让我拍案叫绝的是，作者Timo哲学般地在我们的语言中看到了流动的api。

我们的语言，是有结构的，如果把我们的一句话分成前后半句，后半句的发生一般来说是靠前半句触发，像极了api工作方式，前半句是输入，后半句是输出。


马东锡 NLP
@dongxi_nlp
·
Mar 25, 2023
4/ 插播Language Modeling:

语言是流淌的时序sequence，每一个字的出现都与这个字出现之前的时序关联，比如 “我爱推特”，中的特与‘我爱推’相关，当然此处‘油’也符合条件。

这种接话茬般的language modeling也是gpt预训练的重要方法，让gpt系统模型拥有了超强接话茬能力，进而获得语言能力。



马东锡 NLP
@dongxi_nlp
·
Mar 25, 2023
5/ 作者Timo看到并把流动的语言api拿出，又再次explicitly嵌入在语言之中，相当于把语料apply了一个function，例如：

Joe Biden was born in Scranton.
变为：

Joe Biden was born in [QA("Where was Joe
Biden born?")] Scranton

[QA("Where was Joe Biden born?")] 就是一个api。


马东锡 NLP
@dongxi_nlp
·
Mar 25, 2023
6）为了造出大量的并有较高质量带有这种api的预料，作者先是通过prompting语言模型造出如上条造出大量example。

由于这些example是不够可靠的，有很多无用的api，作者再次运用language modeling，通过判断产生的api example是否可以准确预测未来时序的token（api是否执行成功），来进行过滤。



马东锡 NLP
@dongxi_nlp
·
Mar 25, 2023
7）最终过滤好的质量较高的api被作者设计的special token<API></API>显性地放到语料中, 例子如下：

Joe Biden was born in <API>[QA("Where was Joe
Biden born?")] ->Scranton </API>



马东锡 NLP
@dongxi_nlp
·
Mar 25, 2023
8) 用此语料，作者再一次运用language modeling，fintune了GPT-J。经过这种预料的fintune，模型学会了when，which，how to call api：

when: 自然语言input：joe biden was born in

which/how API call: [QA("Where was JoeBiden born?")]
。

QA是api的类名，"Where was JoeBiden born?"是参数



马东锡 NLP
@dongxi_nlp
·
Mar 25, 2023
9）我们再次回到openai plugin的场景，此时你也许明白了，根据用户的自然语言，模型为什么可以知道call哪个endpoint，以及传递什么样的参数了。


马东锡 NLP
@dongxi_nlp
·
Mar 25, 2023
10) 
如果大家喜欢我这种讲论文的方式，请给我点赞鼓励😃
注：如果这个thread中有任何差错，欢迎大家指正，讨论，让我们一起提高。

附上原文链接：




https://arxiv.org/abs/2302.04761


RNN有小范围的context信息获取能力，比如写中国古诗。
看2014年的一篇论文，以及GitHub实现。
https://github.com/XingxingZhang/rnnpg
