# Contributing

We welcome your contributions and thank you for working to improve the Gno development experience in VS Code.

This guide will explain the process of setting up your development environment to work on the VS Code Gno extension, as well as the process of sending out your change for review.

Our canonical Git repository is located at https://github.com/gnoverse/vscode-gno.

* [Before you start coding](#before-you-start-coding)
	* [Language Server](#language-server-gnopls)
* [Developing](#developing)
  * [Setup](#setup)
  * [Lint](#lint)
  * [Run](#run)

## Before you start coding

If you are interested in fixing a bug or contributing a feature, please [file an issue](https://github.com/gnoverse/vscode-gno/issues/new/choose) first. Wait for a project maintainer to respond before you spend time coding.

If you wish to work on an existing issue, please add a comment saying so, as someone may already be working on it. A project maintainer may respond with advice on how to get started. If you're not sure which issues are available, search for issues with the [help wanted label](https://github.com/gnoverse/vscode-gno/labels/HelpWanted).

### Language Server (`gnopls`)

Many of the language features like auto-completion, documentation, diagnostics are implemented
by the Gno language server ([`gnopls`](https://github.com/gnoverse/gnopls)).
This extension communicates with `gnopls` using [vscode LSP client library](https://github.com/microsoft/vscode-languageserver-node) from [`language/gnoLanguageServer.ts`](https://github.com/gnoverse/vscode-gno/tree/main/src/language).

For extending the language features or fixing bugs, please follow `gnopls`'s
[contribution guide](https://github.com/gnoverse/gnopls/tree/main/doc/contributing.md).

## Developing

### Setup

1) Install [node](https://nodejs.org/en/). Note: make sure that you are using `npm v7` or higher. The file format for `package-lock.json` (changed significantly)[https://docs.npmjs.com/cli/v7/configuring-npm/package-lock-json#file-format] in `npm v7`.
And install [Go](https://go.dev/) 1.21 or newer and [Gno](https://docs.gno.land/getting-started/local-setup/installation) if you haven't already.

2) Clone the repository, run `npm ci`, and open VS Code:

    ```bash
    git clone https://github.com/gnoverse/vscode-gno
    cd vscode-gno
    npm ci
    code .
    ```

#### Lint

You can run `npm run lint` on the command-line to check for lint errors in your program. You can also use the [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) plugin to see errors as you code.

### Run

To run the extension with your patch, open the Run view (`Ctrl+Shift+D` or `⌘+⇧+D`), select `Launch Extension`, and click the Play button (`F5`).

This will open a new VS Code window with the title `[Extension Development Host]`. You can then open a folder that contains Gno code and try out your changes.

You can also set breakpoints to debug your change.

If you make subsequent edits in the codebase, you can reload (`Ctrl+R` or `⌘+R`) the `[Extension Development Host]` instance of VS Code, which will load the new code. The debugger will automatically reattach.

```
⚠️ The tools/generate.go file automatically updates docs/commands.md and docs/settings.md from the package.json.
So if you add new commands and/or settings to the package.json, remember to run tools/generate.go to update the documentation.
Similarly, if you add tools to the allTools.ts.in file, this will update src/gnoToolsInformation.ts.
```
