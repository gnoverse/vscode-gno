# Features

This document describes the features supported by this extension.

## Table of Contents

- [Highlighting](#highlighting)
- [Formatting](#formatting)
- [IntelliSense](#intellisense)
- [Gno Test](#gno-test)
    * [Test Package](#test-package)
    * [Test File](#test-file)
    * [Test Function](#test-function)
    * [Test At Cursor](#test-at-cursor)
- [Debugging](#debugging)
- [gnodev](#gnodev)
- [Render Preview](#render-preview)
- [Networks](#networks)
- [Add Package](#add-package)
- [Call And Query Realms](#call-and-query-realms)
- [Mod Init](#mod-init)
- [Find References](#find-references)
- [Find Implementations](#find-implementations)
- [Code Navigation](#code-navigation)
    * [Go to definition](#go-to-definition)
- [Package Source Links](#package-source-links)
- [Call Hierarchy](#call-hierarchy)
- [Toggle Between Code and Tests](#toggle-between-code-and-tests)
- [Add Import](#add-import)
- [Rename Symbol](#rename-symbol)
- [Refactor](#refactor)

## Highlighting

The default syntax highlighting for gno files is implemented in Visual Studio Code using TextMate grammar, not by this extension.

<div style="text-align: center;"><img src="images/highliting.png" alt="" style="width: 100%"> </div>

## Formatting

Format code and organize imports, either manually or on save.

The extension formats `gno` code, organizes imports, and removes unused imports by default.
- **Organizing imports**
When organizing imports, the imported packages are grouped in the `goimports` style.

<div style="text-align: center;"><img src="images/formated.gif" alt="" style="width: 100%"> </div>

## IntelliSense   

- **Code completion**: Suggestions appear as you type.
- **Signature help**: Displays function parameters as you type.
- **Quick info**: Shows documentation when hovering over symbols.

<div style="text-align: center;"><img src="images/Intellisense.gif" alt="" style="width: 100%"> </div>

## Gno Test

### Test Package

Runs all unit tests in a specified Gno package to verify the functionality of the entire module.

### Test File

Executes all tests within a specific `gno` test file.

### Test Function

Test a specific function

<div style="text-align: center;"><img src="images/test-function.gif" alt="" style="width: 100%"> </div>

### Test At Cursor

Executes the test case where the cursor is currently placed in the code editor.

## Debugging

Debug a Gno package with breakpoints, stepping, the call stack, local variables, and expression evaluation (watch, hover, debug console). The extension drives the interactive debugger of `gno run -debug-addr`.

Press `F5` in a `.gno` file to debug its package, or add a `gno` configuration to `launch.json`:

```json
{
  "type": "gno",
  "request": "launch",
  "name": "Debug Gno package",
  "program": "${fileDirname}",
  "expr": "Render(\"\")"
}
```

`program` is a file or package directory passed to `gno run`. `expr` is optional and defaults to `main()`.

Limitations of the underlying debugger:
- Breakpoints work in the debugged program and in imported packages of GNOROOT (stdlibs and examples). Other imported packages are not supported.
- The debugger never stops at some statements, such as assignments of constants. Put the breakpoint on a nearby line.
- Breakpoints changed while the program runs take effect at the next stop. There is no pause.
- Expressions are limited to identifiers, selectors, indexes and literals (no calls or operators).
- Locals are found from the source of the current function and values cannot be expanded.

## gnodev

Run a local [gnodev](https://docs.gno.land/resources/gnodev) node from the editor. Click the gnodev button in the editor title bar of a Gno file, or run **Gno: Start gnodev**. gnodev loads the package or workspace of the file and reloads it when you save.

gnoweb opens in a panel beside the editor. Its title bar has buttons to reload the packages, reset the realms state, and open gnoweb in your browser. Closing the panel stops gnodev.

Related settings:
- `gno.gnodev.openBrowser` sets where gnoweb opens.
- `gno.gnodev.flags` passes extra flags to gnodev.
- `gno.gnodev.displayButton` shows or hides the title bar button.

## Render Preview

Click **preview render** above `func Render` to see the output of your realm in gnoweb. gnodev starts if it is not running, and the preview updates every time you save. Click **preview render path...** to pass a path to `Render`.

<div style="text-align: center;"><img src="images/render-preview.gif" alt="Preview the Render output of a realm and update it on save" style="width: 100%"> </div>

## Networks

Transactions and queries go to the network selected with `gno.network`. The default `local` network is the node started by gnodev. Click the network name in the status bar, or run **Gno: Select Network**, to switch.

Add your own networks in `gno.networks`:

```json
"gno.networks": {
  "local": {
    "remote": "127.0.0.1:26657",
    "chainId": "dev",
    "gnoweb": "http://127.0.0.1:8888"
  },
  "mynet": {
    "remote": "https://rpc.example.com:443",
    "chainId": "mynet",
    "gnoweb": "https://example.com"
  }
}
```

## Add Package

Publish Gno package/realm to the chain. The transaction is sent to the network selected with `gno.network`. `gnokey` needs to be installed for this feature to work.

## Call And Query Realms

Click **call** above an exported crossing function, `func F(cur realm, ...)`, to call it with `gnokey maketx call`. The extension asks for the arguments, the coins to send, and the key that signs the transaction. The result appears in the Output panel.

<div style="text-align: center;"><img src="images/call-realm.gif" alt="Call a realm function and see the new state in the Render preview" style="width: 100%"> </div>

The same actions are in the Command Palette and the editor context menu:
- **Gno: Call Realm Function** calls a crossing function of the current realm.
- **Gno: Run Script On Chain** runs `func main` of the current file with `gnokey maketx run`.
- **Gno: Evaluate Expression In Realm** evaluates an expression such as `Count()` with `vm/qeval`.
- **Gno: Query Render** shows the `Render` output of the realm with `vm/qrender`.

<div style="text-align: center;"><img src="images/eval-realm.gif" alt="Evaluate an expression in a realm" style="width: 100%"> </div>

`gnokey` needs to be installed, with your key in its keybase.

## Mod Init

Create a `gnomod.toml` file.

## Find References

Find or go to the references of a symbol.

## Find Implementations

Find the concrete types that implement a given interface.

<div style="text-align: center;"><img src="images/find-implementation.gif" alt="Go to implementations of an interface in memeland.gno" style="width: 100%"> </div>



## [Code Navigation](https://code.visualstudio.com/docs/editor/editingevolved)

### Go to definition

Jump to or peek a symbol's declaration.

## Package Source Links

Import paths and hover links of packages on chain, such as `gno.land/p/nt/avl/v0`, open the package source on gnoweb instead of pkg.go.dev. The links use the `gnoweb` URL of the selected network, or https://gno.land when it is not set.

## Call Hierarchy

Show all calls from or to a function.

<div style="text-align: center;"><img src="images/call-hierarchy.gif" alt="Show call hierarchy and investigate callers of a function" style="width: 100%"> </div>

## Toggle Between Code And Tests

Quickly toggle between a file and its corresponding test file by using the [`Gno: Toggle Test File`](commands.md#gno-toggle-test-file) command.

<div style="text-align: center;"><img src="images/toggle-between-code-and-tests.gif" alt="Toggle between memeland.gno and its test file" style="width: 100%"> </div>

## Add Import

The extension organizes imports automatically and can add missing imports.



## [Rename Symbol](https://code.visualstudio.com/docs/editor/refactoring#_rename-symbol)

Rename all occurrences of a symbol in your workspace.

Requires the [`gnopls`](https://github.com/gnoverse/gnopls) language server (`gno.useLanguageServer`).

<div style="text-align: center;"><img src="images/rename-symbol.gif" alt="Rename an exported variable in gno" style="width: 100%"> </div>


## Refactor

Select the area for refactoring (e.g. variable, function body, etc). Click on the Code Action light bulb icon
that appears in the selected area, or select "Refactoring..." or "Rename Symbol" from the VS Code Context menu.
<div style="text-align: center;"><img src="images/refactor.gif" alt="" style="width: 100%"> </div>

