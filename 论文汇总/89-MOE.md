马东锡 NLP
@dongxi_nlp
·
Dec 13, 2023
Mistral AI放出Mixtral 8x7B, 基于Mixture of Experts (MoE)的开源模型，效果不错。

但在我看来，MoE是transformer时代LSTM-GRU，是NLP古早的范式，architecture engineering，非常old school。核心方法是加一些gate来加强Efficient Training at Scale，简言之目的是为了低成本训练，而不是为了塑造专家模型。

而Mixture of Experts的名字，太具迷惑性了，字面意思似乎是各种专家模型的组合起到1+1>2的效果。但实际看看Mixtral 8x7B，8个mistral 7b，b b不一样，但没有一个是专家模型，之所以叫做expert，居然是MoE中的FNN，我十分怀疑FNN能有什么专家能力。

它的benchmarking也理所当然的跟通用大模型GPT3.5/Llama 2相比，比较的是generic能力，并没有什么突出的专家能力。粗算了一下，8x7B float16, 至少需要100GB以上GPU显存，cost巨大。在这种情况下，oss的情怀，不足以说服我不用OpenAI的api。

如果我们停下来想想，什么是expert。
首先，expert能力一定不是通用大模型的generic的能力，而是独特的specialization的能力。例如会写code的GitHub copilot，或会generate思科路由器配置命令，甚至特别会planning，特别会算数都是专家能力都算。
简言之，expert能力是会产生特定领域特定输出的能力。所以，MoE是一个好名字，在这个时代，缺有些名不副实。

而做specialization模型的技术，依然在发展，并且依然是前沿，其实就是lora微调，例如Stanford's Alpaca models项目等等，核心思想就是在开源模型上加adapter，使之能够完成一个具体领域的专家工作，其实Mistral AI的开源7b模型估计也是这么做出来的。

未来，大语言模型作为agent的时代在实际中的应用，一定是llm在中间协调多种多样不同7b抽象出来的api，来完成新的human computer interaction。甚至在特定领域，这个协调工作也可以被planning expert的开源模型替代，而协调的过程，还是离不开 CoT，React，ReWoo或者其他的prompting方法。

CoT, ReAct在我的推中已经分享过好几次了，接下来找时间把ReWoo, 几个微调的介绍（跳票很久了）分享给大家。
