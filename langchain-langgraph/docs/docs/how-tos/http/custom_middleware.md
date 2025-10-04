# 如何添加自定义中间件

在将智能体部署到 LangGraph Platform 时，您可以向服务器添加自定义中间件来处理日志记录请求指标、注入或检查标头以及执行安全策略等关注点，而无需修改核心服务器逻辑。这与[添加自定义路由](./custom_routes.md)的工作方式相同。您只需要提供自己的 [`Starlette`](https://www.starlette.io/applications/) 应用（包括 [`FastAPI`](https://fastapi.tiangolo.com/)、[`FastHTML`](https://fastht.ml/) 和其他兼容应用）。

添加中间件允许您在部署中全局拦截和修改请求和响应，无论它们是访问您的自定义端点还是内置的 LangGraph Platform API。

下面是一个使用 FastAPI 的示例。

???+ note "仅限 Python"

    我们目前仅在 `langgraph-api>=0.0.26` 的 Python 部署中支持自定义中间件。

## 创建应用

从**现有的** LangGraph Platform 应用开始，将以下中间件代码添加到您的 webapp 文件中。如果您从头开始，可以使用 CLI 从模板创建新应用。

```bash
langgraph new --template=new-langgraph-project-python my_new_project
```

一旦您有了 LangGraph 项目，添加以下应用代码：

```python
# ./src/agent/webapp.py
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware

# highlight-next-line
app = FastAPI()

class CustomHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers['X-Custom-Header'] = 'Hello from middleware!'
        return response

# 将中间件添加到应用
app.add_middleware(CustomHeaderMiddleware)
```

## 配置 `langgraph.json`

将以下内容添加到您的 `langgraph.json` 配置文件中。确保路径指向您上面创建的 `webapp.py` 文件。

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./src/agent/graph.py:graph"
  },
  "env": ".env",
  "http": {
    "app": "./src/agent/webapp.py:app"
  }
  // 其他配置选项，如 auth、store 等。
}
```

## 启动服务器

在本地测试服务器：

```bash
langgraph dev --no-browser
```

现在对您服务器的任何请求都将在其响应中包含自定义标头 `X-Custom-Header`。

## 部署

您可以将此应用按原样部署到 LangGraph Platform 或您的自托管平台。

## 下一步

现在您已经向部署添加了自定义中间件，您可以使用类似的技术来添加[自定义路由](./custom_routes.md)或定义[自定义生命周期事件](./custom_lifespan.md)来进一步自定义服务器的行为。
