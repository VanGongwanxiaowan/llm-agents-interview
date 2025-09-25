「 SWE Agent, Multi-Agent 」

SWE-Factory: Your Automated Factory for Issue Resolution Training Data and Evaluation Benchmarks

Multi-Agent 协作分工，为 GitHub Issue 解决任务生成benchmark。

SWE 的重要性不再赘述，它指向了未来：
1. 交互上从 GUI 转变为ACI, 从 “面相人类” 转为 “面向 Agent”。
2.  LLM coder 从 copilot 转变为 software engineer， CodeX 就是一个鲜明的例子。

作者提出的 SWE-Factory，为这一转变进一步提供关于github issue (bug fix, feature improve) 的高质量数据集和benchmark。

方法上，SWE-Factory 的 SWE-Builder 采用 Multi-Agent 做蒸馏。

SWE-Builder：Multi-Agent 系统 包含四个 Sub Agent 用于信息搜集、依赖推理、脚本生成和错误诊断
- Repository Explorer 
- Environment Manager 
- Test Manager 
- Test Analyst 

四个协作代理，循环迭代生成 Dockerfile + 测试脚本。

另外设置标准化 Exit-Code 判分和自动化 F2P 校验进一步增强了自动化程度。

Multi-Agent 因为角色的丰富性，非常适合做蒸馏，已经看到 CodeContests+ 和 SWE-Builder，相信这样的工作会越来越多。

畅想一下，未来 LLM coder，可以fix issue，可以提交feature，并同步生成dockerfile，测试脚本。

听上去似乎很遥远，但随着 SWE Agent的发展，这天一定会到来。

https://arxiv.org/abs/2506.10954


