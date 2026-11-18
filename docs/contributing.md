# Contributing

We welcome your contributions and thank you for working to improve the Gno development experience in VS Code.

This guide will explain the process of setting up your development environment to work on the VS Code Gno extension, as well as the process of sending out your change for review.

Our canonical Git repository is located at https://github.com/notJoon/vscode-gno. It is a fork of [gnoverse/vscode-gno](https://github.com/gnoverse/vscode-gno).

* [Before you start coding](#before-you-start-coding)
	* [Language Server](#language-server-gnopls)
* [Developing](#developing)
  * [Setup](#setup)
  * [Lint](#lint)
  * [Test](#test)
  * [Run](#run)
* [Releasing](#releasing)

## Before you start coding

If you are interested in fixing a bug or contributing a feature, please [file an issue](https://github.com/notJoon/vscode-gno/issues/new) first. Wait for a project maintainer to respond before you spend time coding.

If you wish to work on an existing issue, please add a comment saying so, as someone may already be working on it. A project maintainer may respond with advice on how to get started. If you're not sure which issues are available, search for issues with the [help wanted label](https://github.com/notJoon/vscode-gno/labels/help%20wanted).

### Language Server (`gnopls`)

Many of the language features like auto-completion, documentation, diagnostics are implemented
by the Gno language server ([`gnopls`](https://github.com/gnoverse/gnopls)).
This extension communicates with `gnopls` using [VS Code LSP client library](https://github.com/microsoft/vscode-languageserver-node) from [`language/gnoLanguageServer.ts`](../src/language/gnoLanguageServer.ts).

For extending the language features or fixing bugs, please follow `gnopls`'s
[contribution guide](https://github.com/gnoverse/gnopls/tree/main/doc/contributing.md).

## Developing

### Setup

1) Install [mise](https://mise.jdx.dev/getting-started.html). It installs the Node.js and Go versions pinned in `mise.toml`, which the CI uses too. Also install [Gno](https://docs.gno.land/builders/install) if you haven't already.

2) Clone the repository, install the tools and dependencies, and open VS Code:

    ```bash
    git clone https://github.com/notJoon/vscode-gno
    cd vscode-gno
    mise install
    npm ci
    code .
    ```

    Without mise, install the versions listed in `mise.toml` yourself.

### Lint

You can run `npm run lint` from the command line to check for lint errors in your program. You can also use the [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) plugin to see errors as you code. Run `npm run format` to format the code.

### Test

* `npm run unit-test` runs the unit tests.
* `npm test` runs the integration tests in a VS Code instance.

### Run

To run the extension with your patch, open the Run view (`Shift+Ctrl+D` or `Shift+Cmd+D`), select `Launch Extension`, and click the Play button (`F5`).

This will open a new VS Code window with the title `[Extension Development Host]`. You can then open a folder that contains Gno code and try out your changes.

You can also set breakpoints to debug your change.

If you make subsequent edits in the codebase, you can reload (`Ctrl+R` or `⌘+R`) the `[Extension Development Host]` instance of VS Code, which will load the new code. The debugger will automatically reattach.

```
⚠️ The tools/generate.go file automatically updates docs/commands.md and docs/settings.md from the package.json.
So if you add new commands and/or settings to the package.json, remember to run "go run tools/generate.go" from the repository root to update the documentation.
Similarly, if you add tools to the allTools.ts.in file, this will update src/gnoToolsInformation.ts.
```

## Releasing

Releases are made by hand, once enough changes have accumulated on `main`.

1) While changes land, add each of them to the `CHANGELOG.md` section of the next version, and set that version in `package.json` (`npm version <version> --no-git-tag-version`).
2) Run the **GitHub Release** workflow from the Actions tab. It reads the version from `package.json`, fails if the tag already exists or `CHANGELOG.md` has no section for it, and creates the `v<version>` tag and a GitHub release with the packaged extension and that section as notes.

Releases are published as pre-release `.vsix` files on [GitHub Releases](https://github.com/notJoon/vscode-gno/releases). The extension is not published to the Marketplace.
