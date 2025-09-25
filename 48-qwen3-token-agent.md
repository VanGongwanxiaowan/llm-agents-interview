「Qwen3, Token, Agent」分析

added_tokens， 如主板上的卡槽，预留大模型新功能空间。

昨天Qwen3发布，最亮眼的是，原生支持agentic tool call以及MCP。这篇分析，主要从tool call入手，了解大模型中added_tokens的作用和意义。

每当大模型发布，我都会打开它的tokenizer.json去看added_tokens。

added_tokens的意义在于，在LLM的vacabulary中添加特殊token，我自己称之为 “协议token”，这部分token不会被BPE分词，会完成输出，目的就是规则性地提示大模型此处要进行特别的功能，比如tool call和thinking。

当我们打开Qwen3的tokenizer.json， 会很看十几个added_tokens，我把它们总结如下，并加上我对他们功能的理解和猜想：

普通会话类：
<|endoftext|> <|im_start|> <|im_end|> ：会话边界

Tool call，Agent类:
<tool_call> / </tool_call> ： 函数执行JSON 
<tool_response> / </tool_response>：工具执行结果
<think> / </think>： 思考
短评： [像不像Paper: ReCall？ 参考我前一篇分享]

多模态类：
<|vision_start|End>: 预留视觉空间
<|image_pad|>：预留图片空间
<|video_pad|>： 预留视频空间
短评：Qwen3只支持文本，但未来一定会多模态！

代码和RAG类：
<|fim_prefix|>： 代码类
<|repo_name|>：代码repo
<|file_sep|>：大文件

比喻的来说，这些added_token就像是计算机主板的卡槽，为新的功能，新的性能，提前预留空间。

比如tool call，agent类，Qwen3已经支持，那就说明这个卡槽被利用，如何实现的，就是training recipe (SFT+RL)，具体的可以参考我分享的ReCall, ReSearch, ReTool, APR, PASTA等文章。

那Qwen3是如何支持MCP的呢？

一个完整例子
用户问题：When will the ISS fly over Stockholm next, and could you add a calendar reminder for me?

在mcp server中定义了两个tool来追踪国际空间站：
def get_next_iss_pass(city: str) -> dict:    
def add_calendar_event(title: str, datetime_utc: str) -> str

Jinja template会直接把用户的问题结合added_token，render给大模型：

<|im_start|>user
When will the ISS fly over Stockholm next, and could you add a calendar reminder for me?
<|im_end|>

<|im_start|>assistant
<think>I need an orbital pass → then a calendar entry.</think>
<tool_call>{"name":"get_next_iss_pass","arguments":{"city":"Stockholm"}}
</tool_call>
<|im_end|>

工具get_next_iss_pass的返回结果，直接给mcp host side，

<tool_response>{"datetime_utc":"2025-04-30T19:12:00Z"}</tool_response>
<|im_end|>

然后继续触发下一个tool call。

喜欢钻研的朋友，会发现其实DeepSeek R1也有类似的add_token, "<｜tool▁calls▁begin｜>", 但它不支持mcp，因为它只是预留了，并没有在实际训练中让LLM跟mcp互动。

希望看完这篇分享的你，明白了added_token是什么，你也许也更加深刻地理解了我之前分享的一系列“协议token”的文章，ReCall, ReSearch, ReTool, APR, PASTA.

<img width="1184" height="338" alt="image" src="https://github.com/user-attachments/assets/b0cfd389-77a1-49ce-ba23-1f931a216119" />

some links:

DeepSeek r1 tokenizer:
https://huggingface.co/deepseek-ai/DeepSeek-R1/blob/main/tokenizer.json

Jinjia tempalte
https://jinja.palletsprojects.com/en/stable/

Qwen3 tokenizer:

https://huggingface.co/Qwen/Qwen3-235B-A22B/blob/main/tokenizer.json









