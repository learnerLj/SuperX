# SuperX

Fact-check X posts as you scroll. Answers appear in a right-hand panel without switching pages.

[简体中文](README.zh-CN.md) · [Changelog](CHANGELOG.md) · [Privacy](PRIVACY.md)

## Features

- X built-in Grok in Fast mode, with Grok subscription sign-in, API Key and local Grok Build as alternatives.
- Markdown, mathematical formulas and clickable source citations.
- Persistent local answer caching with a configurable limit, defaulting to 1 GB.
- Preload the next five posts by default, with an adjustable count. Replies on post detail pages are analyzed manually.
- Pause/resume, a resizable answer panel and answer-language settings.

## Install

Installing from this repository requires Node.js 22 or newer:

```sh
git clone https://github.com/learnerLj/SuperX.git
cd SuperX
npm ci
npm run build
```

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge and enable **Developer mode**.
2. Choose **Load unpacked** and select the project's `extension/` folder.
3. Open SuperX settings, choose a connection and save. For **X built-in Grok**, sign in to X first.
4. Refresh X and start browsing.

After updating the source, run `npm run build`, reload the extension, then refresh X.

## Use

Existing answers are reused when available. Choose **Reanalyze** for a fresh check. Pause stops new automatic analysis; requests already started continue to completion.

Model access, allowance and charges depend on your selected service and account. AI answers can be wrong; check the cited sources.

See [connection setup](docs/CONNECTIONS.md) for other providers and [Contributing](CONTRIBUTING.md) for development and build instructions.

## Thanks

This project builds on [bwjoke/SuperX](https://github.com/bwjoke/SuperX). Thank you to the upstream author and all contributors.

[MIT License](LICENSE)
