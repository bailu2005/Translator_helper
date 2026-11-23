# 隐私政策（Privacy Policy）

- 适用扩展：Translator Helper
- 版本：0.2.0
- 生效日期：2026-11-23

Translator Helper 是日文漫画 / 图片文字翻译浏览器扩展。本政策说明扩展会处理哪些数据、数据流向哪里，以及你可以如何清除数据。

## 1. 我们不收集什么

- 不要求注册账号。
- 不包含统计、埋点、广告或用户画像 SDK。
- 项目方不运营用于收集数据的服务器。
- 不出售、不出租用户数据。

## 2. 本地处理

- 框选区域的截图默认在本机处理，用于预览、OCR 和翻译。项目方不会收到这些图片。
- 默认 OCR 使用本机 `ocr-service`（`http://127.0.0.1:8765`），图片只发送到本机回环地址。
- 内置 Tesseract 回退在浏览器本地运行。
- 历史截图、OCR 原文、译文、学习卡、生词本、设置与 API Key 存放在浏览器扩展存储（`storage.session` / `storage.local`）中。

如果你把 OCR 服务地址改为非本机地址，图片会发送到你配置的该服务；这由你自行负责。

## 3. 联网与第三方

扩展只在以下情况发起网络请求：

| 场景                      | 发送内容                 | 接收方                          |
| ------------------------- | ------------------------ | ------------------------------- |
| 本地 OCR（默认）          | 图片                     | 本机 `127.0.0.1` 的 ocr-service |
| 拉取跨域图片              | 图片 URL                 | 图片所在网站                    |
| LLM 翻译 / 学习卡（可选） | 日文原文、上下文、术语表 | 你在设置中填写的 Base URL       |
| MyMemory 翻译（免费兜底） | 日文原文                 | `api.mymemory.translated.net`   |
| Chrome 内置翻译（可选）   | 日文原文                 | 浏览器本地翻译 API              |

- 使用 LLM 时，请同时阅读你所用服务商的隐私政策与数据处理条款。
- 使用 MyMemory 时，文本会发送到该公共服务；请勿翻译敏感内容。
- API Key 仅保存在浏览器本地存储（未加密），不会发送到项目方服务器。

## 4. 权限用途

- `storage`：保存设置、术语表、生词本、缓存与历史元数据。
- `activeTab` / `scripting`：在你主动触发时注入框选脚本。
- `sidePanel`（Chrome/Edge）/ `sidebar_action`（Firefox）：显示侧边栏结果。
- `contextMenus`：右键菜单入口。
- `host_permissions: <all_urls>`：读取跨域漫画图片原始像素、视口截图兜底、请求本地 OCR 服务与翻译接口。

## 5. 数据保留与删除

- 历史截图存放在会话存储，浏览器重启后通常清除。
- 译文/学习卡元数据、生词本、术语表与设置保存在本地存储，直到你删除或卸载扩展。
- 可在侧边栏删除单条历史、清空历史；在设置页清空术语表与生词本。
- 卸载扩展会清除扩展的浏览器存储数据。

## 6. 儿童

本扩展不是面向儿童的产品，也不会有意收集儿童数据。

## 7. 政策变更

政策更新时会修改本文件顶部的版本与日期，并随仓库发布。

## 8. 联系方式

请通过 GitHub Issues 联系：<https://github.com/bailu2005/Translator_helper/issues>

---

## English summary

Translator Helper processes selected screenshots locally by default. Images go only to the local OCR service at `127.0.0.1` unless you configure another OCR URL. Recognized Japanese text may be sent to your configured LLM endpoint, the Chrome built-in translator, or MyMemory for translation. Settings, vocabulary, history metadata and API keys are stored in browser extension storage and are never sent to the project maintainers. There are no accounts, analytics, ads or tracking, and no data is sold. You can delete history, vocabulary and settings in the extension UI, or uninstall the extension to clear its storage. Contact: <https://github.com/bailu2005/Translator_helper/issues>.
