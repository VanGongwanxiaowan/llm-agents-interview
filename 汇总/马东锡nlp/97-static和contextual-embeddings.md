接自己上条解释什么是token来看百度文心的套壳嫌疑。

首先要理解static embedding和contextual embedding的区别

在static embedding中，词的embedding是固定的，比如see和seen，saw都接近，而saw（锯）跟wood接近，那么see就跟wood也接近。如果是多语言的，那么see和木头这俩词也在embedding空间接近

马东锡 NLP
@dongxi_nlp
·
Mar 22, 2023
在llm中这个问题不存在，因为词的embedding由句子的context决定，每次都不一样。这样llm算出的I see the cat中的see， 与I saw the wood 中的saw就不接近了。



马东锡 NLP
@dongxi_nlp
·
Mar 22, 2023
所以在context极少的情况下， draw the picture of bus and mouse，在英文中才会出错，因为bus 和mouse的token id是唯一的。
在中文不会，因为 总 线 公 交 车 鼠 标 老 鼠的token id是完全不一样的。（token id看我上条推特）
所以大概率，百度文新先翻译，再生成，套壳嫌疑非常大。



马东锡 NLP
@dongxi_nlp
·
Mar 22, 2023
我们首先load一个英文bert模型，把‘Developer likes developing skills’ 做tokenization。
发现 Developer 被拆成了 'Dev', ##'elo, '##'per' 几个subtoken。 
这个例子告诉我们，bert处理英文中，一个单词不一定是一个token，它考虑了sub token的character级别的编码。
那么中文是怎么样的呢？

<img width="617" height="78" alt="image" src="https://github.com/user-attachments/assets/b8b74ccc-1a64-4763-97f8-81f3e2f4b6da" />

我们load一个中文bert模型，把‘开发者喜欢学习新姿势。’做tokenization。
由于我们中文一个字就是一个character，所以一个字就是一个token。

<img width="624" height="75" alt="image" src="https://github.com/user-attachments/assets/e03ec9d5-90aa-470f-a853-fc6543c1286f" />


马东锡 NLP
@dongxi_nlp
·
Mar 22, 2023
我们看到，由于语言天生的差异，tokenization的结果也不同。直观来看，英文的一个word中的letter本身的组合就有意义，比如developer的词根与develop有关，er表示名词。那么在character级别上做tokenization，可以抓到更多的信息。



马东锡 NLP
@dongxi_nlp
·
Mar 22, 2023
那么为什么要做tokenization呢，主要是模型不识字，它主要还是把输入的文字转成token，然后根据自己的字典查询token的顺序代码，来记住输入的是什么。

让我们把姿势输入tokenizer后的张量拿出来，会发现2013， 和1232两个代码。


<img width="480" height="61" alt="image" src="https://github.com/user-attachments/assets/c4f2c07c-3137-4d1a-b6f0-e71044d2cece" />


马东锡 NLP
@dongxi_nlp
·
Mar 22, 2023
我们找到在本地cache路径下的vocab.txt, 用vim打开，搜索 ‘姿’，会发现它在2014行，由于我的vim是从1开始显示行数的，而bert的字典是从0开始的，所以，它的id应该是2014-1=2013。
NLP语言模型就是这么查字典的，跟我们人类差不多。


<img width="414" height="58" alt="image" src="https://github.com/user-attachments/assets/f2e0917f-5afe-4e38-b30f-787cc2d3bbae" />




JW (谢绝私聊)
@jameswang4648
·
Mar 23, 2023
在C語言裡，{ 和 } 括號都算token 。
马东锡 NLP
@dongxi_nlp
·
Mar 23, 2023
是的，在nlp中，所有的punctuation也都算token，都有自己的id


















