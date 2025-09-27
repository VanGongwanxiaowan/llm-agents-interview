Unsloth 夯微调版本 GPT-OSS 来了, 上下文长度提升了8倍，显存用量减少50%！

需要注意的是，这里提升的是原生上下文长度！（GPT-OSS原生上下文长度只有可怜的4K）而不是  ROPE YaRN 扩展那个。也就是说 Unsloth 这个版本在60K上下文以内效果都非常好，然后再用 YaRN 能可扩展到更长！（按照OpenAI官方那个扩展倍数计算，60K能最大扩到1920K！（1.9M！当然效果肯定没原生的好）我一会问下unsloth看看真的能扩到这么大么，有结论了我贴在评论区）

另外还修复了 gpt-oss 训练损失趋于无穷大的问题，可以放心微调出自己喜欢的版本的 GPT-OSS了。说句题外话，建议只用20B，120B多方面证明还不如20B效果好。

地址：http://docs.unsloth.ai/get-started/all-our-models

<img width="1872" height="2048" alt="image" src="https://github.com/user-attachments/assets/432f03b8-ed9e-46c8-a05f-8aa69b10fcef" />
