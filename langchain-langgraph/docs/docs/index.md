---
hide_comments: true
title: LangGraph
---

<script>
  // 此脚本仅在 MkDocs 中运行，不在 GitHub 上运行
  var hideGitHubVersion = function() {
    document.querySelectorAll('.github-only').forEach(el => el.style.display = 'none');
  };

  // 处理初始加载和后续导航
  document.addEventListener('DOMContentLoaded', hideGitHubVersion);
  document$.subscribe(hideGitHubVersion);
</script>

<p class="mkdocs-only">
  <img class="logo-light" src="static/wordmark_dark.svg" alt="LangGraph 标志" width="80%">
  <img class="logo-dark" src="static/wordmark_light.svg" alt="LangGraph 标志" width="80%">
</p>

<style>
.md-content h1 {
  display: none;
}
.md-header__topic {
  display: none;
}
</style>

{% include-markdown "../../README.md" %}
