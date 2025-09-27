
karminski-牙医
@karminski3
·
Aug 23
Unsloth 量化版本的 DeepSeek-V3.1 来啦！

使用最低的1-bit 动态量化 TQ1_0（不重要 MoE 层使用 1 位，重要 MoE 使用 2-4 位，其余使用 6-8 位）只需要 170GB 磁盘空间 。官方测试开启 MoE 卸载后使用 24GB 显卡和 128GB 内存配置下运行良好。

2bit量化则需要 24GB GPU 和246GB内存，能实现大概 5 token/s 的速度.

顺便官方还放出了运行教程，教程地址：http://docs.unsloth.ai/basics/deepseek-v3.1

<img width="680" height="672" alt="image" src="https://github.com/user-attachments/assets/0a0e6516-a1e1-4a8b-b8af-46823af513cd" />
