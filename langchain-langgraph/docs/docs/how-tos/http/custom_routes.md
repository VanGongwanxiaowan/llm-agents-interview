# 如何添加自定义路由

在将智能体部署到 LangGraph 平台时，您的服务器会自动暴露用于创建运行和线程、与长期内存存储交互、管理可配置助手和其他核心功能的路由（[查看所有默认 API 端点](../../cloud/reference/api/api_ref.md)）。

您可以通过提供自己的 [`Starlette`](https://www.starlette.io/applications/) 应用（包括 [`FastAPI`](https://fastapi.tiangolo.com/)、[`FastHTML`](https://fastht.ml/) 和其他兼容应用）来添加自定义路由。您通过在 `langgraph.json` 配置文件中提供应用路径来让 LangGraph Platform 知道这一点。

定义自定义应用对象允许您添加任何您想要的路由，因此您可以从添加 `/login` 端点到编写整个全栈 Web 应用，所有这些都部署在单个 LangGraph 服务器中。

下面是一个使用 FastAPI 的示例。

## 创建应用

从**现有的** LangGraph Platform 应用开始，将以下自定义路由代码添加到您的 webapp 文件中。如果您从头开始，可以使用 CLI 从模板创建新应用。

```bash
langgraph new --template=new-langgraph-project-python my_new_project
```

一旦您有了 LangGraph 项目，添加以下应用代码：

```python
# ./src/agent/webapp.py
from fastapi import FastAPI

# highlight-next-line
app = FastAPI()


@app.get("/hello")
def read_root():
    return {"Hello": "World"}

```

## 配置 `langgraph.json`

将以下内容添加到您的 `langgraph.json` 配置文件中。确保路径指向您上面创建的 `webapp.py` 文件中的 FastAPI 应用实例 `app`。

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

如果您在浏览器中导航到 `localhost:2024/hello`（`2024` 是默认开发端口），您应该看到 `/hello` 端点返回 `{"Hello": "World"}`。

!!! note "遮蔽默认端点"

    您在应用中创建的路由优先于系统默认值，这意味着您可以遮蔽和重新定义任何默认端点的行为。

## 部署

您可以将此应用按原样部署到 LangGraph Platform 或您的自托管平台。

## 下一步

现在您已经向部署添加了自定义路由，您可以使用相同的技术来进一步自定义服务器的行为，例如定义自定义[自定义中间件](./custom_middleware.md)和[自定义生命周期事件](./custom_lifespan.md)。
