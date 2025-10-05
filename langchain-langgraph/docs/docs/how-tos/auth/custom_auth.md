# 添加自定义身份验证

!!! tip "先决条件"

    本指南假设您熟悉以下概念：

      *  [**身份验证和访问控制**](../../concepts/auth.md)
      *  [**LangGraph Platform**](../../concepts/langgraph_platform.md)

    有关更详细的指导，请参阅[**设置自定义身份验证**](../../tutorials/auth/getting_started.md)教程。

???+ note "按部署类型支持"

    自定义身份验证支持**托管 LangGraph Platform** 中的所有部署，以及**企业**自托管计划。

本指南展示了如何为您的 LangGraph Platform 应用程序添加自定义身份验证。本指南适用于 LangGraph Platform 和自托管部署。它不适用于在您自己的自定义服务器中单独使用 LangGraph 开源库。

!!! note

    自定义身份验证支持所有**托管 LangGraph Platform** 部署，以及**企业**自托管计划。

## 为您的部署添加自定义身份验证

要在部署中利用自定义身份验证并访问用户级元数据，请设置自定义身份验证，通过自定义身份验证处理程序自动填充 `config["configurable"]["langgraph_auth_user"]` 对象。然后您可以在图中使用 `langgraph_auth_user` 键访问此对象，以[允许智能体代表用户执行经过身份验证的操作](#enable-agent-authentication)。

:::python

1.  实现身份验证：

    !!! note

        没有自定义 `@auth.authenticate` 处理程序，LangGraph 只能看到 API 密钥所有者（通常是开发人员），因此请求不会限定到单个最终用户。要传播自定义令牌，您必须实现自己的处理程序。

    ```python
    from langgraph_sdk import Auth
    import requests

    auth = Auth()

    def is_valid_key(api_key: str) -> bool:
        is_valid = # your API key validation logic
        return is_valid

    @auth.authenticate # (1)!
    async def authenticate(headers: dict) -> Auth.types.MinimalUserDict:
        api_key = headers.get("x-api-key")
        if not api_key or not is_valid_key(api_key):
            raise Auth.exceptions.HTTPException(status_code=401, detail="Invalid API key")

        # Fetch user-specific tokens from your secret store
        user_tokens = await fetch_user_tokens(api_key)

        return { # (2)!
            "identity": api_key,  #  fetch user ID from LangSmith
            "github_token" : user_tokens.github_token
            "jira_token" : user_tokens.jira_token
            # ... custom fields/secrets here
        }
    ```

    1. 此处理程序接收请求（标头等），验证用户，并返回至少包含身份字段的字典。
    2. 您可以添加任何自定义字段（例如，OAuth 令牌、角色、组织 ID 等）。

2.  在您的 `langgraph.json` 中，添加身份验证文件的路径：

    ```json hl_lines="7-9"
    {
      "dependencies": ["."],
      "graphs": {
        "agent": "./agent.py:graph"
      },
      "env": ".env",
      "auth": {
        "path": "./auth.py:my_auth"
      }
    }
    ```

3.  一旦您在服务器中设置了身份验证，请求必须包含基于您选择的方案的所需授权信息。假设您使用 JWT 令牌身份验证，您可以使用以下任何方法访问您的部署：

    === "Python 客户端"

        ```python
        from langgraph_sdk import get_client

        my_token = "your-token" # 在实践中，您会使用身份验证提供程序生成签名令牌
        client = get_client(
            url="http://localhost:2024",
            headers={"Authorization": f"Bearer {my_token}"}
        )
        threads = await client.threads.search()
        ```

    === "Python RemoteGraph"

        ```python
        from langgraph.pregel.remote import RemoteGraph

        my_token = "your-token" # In practice, you would generate a signed token with your auth provider
        remote_graph = RemoteGraph(
            "agent",
            url="http://localhost:2024",
            headers={"Authorization": f"Bearer {my_token}"}
        )
        threads = await remote_graph.ainvoke(...)
        ```
        ```python
        from langgraph.pregel.remote import RemoteGraph

        my_token = "your-token" # In practice, you would generate a signed token with your auth provider
        remote_graph = RemoteGraph(
            "agent",
            url="http://localhost:2024",
            headers={"Authorization": f"Bearer {my_token}"}
        )
        threads = await remote_graph.ainvoke(...)
        ```

    === "CURL"

        ```bash
        curl -H "Authorization: Bearer ${your-token}" http://localhost:2024/threads
        ```

## 启用智能体身份验证

在[身份验证](#add-custom-authentication-to-your-deployment)之后，平台创建一个特殊的配置对象（`config`），该对象传递给 LangGraph Platform 部署。此对象包含有关当前用户的信息，包括您从 `@auth.authenticate` 处理程序返回的任何自定义字段。

要允许智能体代表用户执行经过身份验证的操作，请在您的图中使用 `langgraph_auth_user` 键访问此对象：

```python
def my_node(state, config):
    user_config = config["configurable"].get("langgraph_auth_user")
    # 令牌在 @auth.authenticate 函数期间被解析
    token = user_config.get("github_token","")
    ...
```

!!! note

    从安全的密钥存储中获取用户凭据。不建议在图状态中存储密钥。

### 授权 Studio 用户

默认情况下，如果您在资源上添加自定义授权，这也将适用于从 Studio 进行的交互。如果您愿意，可以通过检查 [is_studio_user()](../../reference/functions/sdk_auth.isStudioUser.html) 来不同地处理已登录的 Studio 用户。

!!! note
    `is_studio_user` 在 langgraph-sdk 的 0.1.73 版本中添加。如果您使用的是较旧版本，您仍然可以检查 `isinstance(ctx.user, StudioUser)`。

```python
from langgraph_sdk.auth import is_studio_user, Auth
auth = Auth()

# ... Setup authenticate, etc.

@auth.on
async def add_owner(
    ctx: Auth.types.AuthContext,
    value: dict  # The payload being sent to this access method
) -> dict:  # Returns a filter dict that restricts access to resources
    if is_studio_user(ctx.user):
        return {}

    filters = {"owner": ctx.user.identity}
    metadata = value.setdefault("metadata", {})
    metadata.update(filters)
    return filters
```

只有在您想允许开发人员访问部署在托管 LangGraph Platform SaaS 上的图时才使用此功能。

:::

:::js

1.  实现身份验证：

    !!! note

        没有自定义 `authenticate` 处理程序，LangGraph 只能看到 API 密钥所有者（通常是开发人员），因此请求不会限定到单个最终用户。要传播自定义令牌，您必须实现自己的处理程序。

    ```typescript
    import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";

    const auth = new Auth()
      .authenticate(async (request) => {
        const authorization = request.headers.get("Authorization");
        const token = authorization?.split(" ")[1]; // "Bearer <token>"
        if (!token) {
          throw new HTTPException(401, "No token provided");
        }
        try {
          const user = await verifyToken(token);
          return user;
        } catch (error) {
          throw new HTTPException(401, "Invalid token");
        }
      })
      // Add authorization rules to actually control access to resources
      .on("*", async ({ user, value }) => {
        const filters = { owner: user.identity };
        const metadata = value.metadata ?? {};
        metadata.update(filters);
        return filters;
      })
      // Assumes you organize information in store like (user_id, resource_type, resource_id)
      .on("store", async ({ user, value }) => {
        const namespace = value.namespace;
        if (namespace[0] !== user.identity) {
          throw new HTTPException(403, "Not authorized");
        }
      });
    ```

    1. 此处理程序接收请求（标头等），验证用户，并返回至少包含身份字段的对象。
    2. 您可以添加任何自定义字段（例如，OAuth 令牌、角色、组织 ID 等）。

2.  在您的 `langgraph.json` 中，添加身份验证文件的路径：

    ```json hl_lines="7-9"
    {
      "dependencies": ["."],
      "graphs": {
        "agent": "./agent.ts:graph"
      },
      "env": ".env",
      "auth": {
        "path": "./auth.ts:my_auth"
      }
    }
    ```

3.  一旦您在服务器中设置了身份验证，请求必须包含基于您选择的方案的所需授权信息。假设您使用 JWT 令牌身份验证，您可以使用以下任何方法访问您的部署：

    === "SDK 客户端"

        ```javascript
        import { Client } from "@langchain/langgraph-sdk";

        const my_token = "your-token"; // 在实践中，您会使用身份验证提供程序生成签名令牌
        const client = new Client({
          apiUrl: "http://localhost:2024",
          defaultHeaders: { Authorization: `Bearer ${my_token}` },
        });
        const threads = await client.threads.search();
        ```

    === "RemoteGraph"

        ```javascript
        import { RemoteGraph } from "@langchain/langgraph/remote";

        const my_token = "your-token"; // In practice, you would generate a signed token with your auth provider
        const remoteGraph = new RemoteGraph({
        graphId: "agent",
          url: "http://localhost:2024",
          headers: { Authorization: `Bearer ${my_token}` },
        });
        const threads = await remoteGraph.invoke(...);
        ```

    === "CURL"

        ```bash
        curl -H "Authorization: Bearer ${your-token}" http://localhost:2024/threads
        ```

## 启用智能体身份验证

在[身份验证](#add-custom-authentication-to-your-deployment)之后，平台创建一个特殊的配置对象（`config`），该对象传递给 LangGraph Platform 部署。此对象包含有关当前用户的信息，包括您从 `authenticate` 处理程序返回的任何自定义字段。

要允许智能体代表用户执行经过身份验证的操作，请在您的图中使用 `langgraph_auth_user` 键访问此对象：

```ts
async function myNode(state, config) {
  const userConfig = config["configurable"]["langgraph_auth_user"];
  // 令牌在 authenticate 函数期间被解析
  const token = userConfig["github_token"];
  ...
}
```

!!! note

    从安全的密钥存储中获取用户凭据。不建议在图状态中存储密钥。

:::

## 了解更多

- [身份验证和访问控制](../../concepts/auth.md)
- [LangGraph Platform](../../concepts/langgraph_platform.md)
- [设置自定义身份验证教程](../../tutorials/auth/getting_started.md)
