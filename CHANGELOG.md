Entries for 1.0.1 and earlier come from upstream [gnoverse/vscode-gno](https://github.com/gnoverse/vscode-gno).

## Unreleased


### Features

* start and stop gnodev from the editor, show gnoweb in a webview or the external browser, and reload packages or reset realms state from the webview title bar ([#5](https://github.com/notJoon/vscode-gno/pull/5))
* select the network that transactions are sent to from `gno.networks`, with a remote and a chain ID, through **Gno: Select Network** or the status bar. Gno Add Package To Chain uses it instead of asking for the remote, and now passes the chain ID ([#12](https://github.com/notJoon/vscode-gno/pull/12))
* call crossing functions of realms from a `call` code lens or **Gno: Call Realm Function**, run a script with **Gno: Run Script On Chain**, and query realms with **Gno: Evaluate Expression In Realm** (`vm/qeval`) and **Gno: Query Render** (`vm/qrender`) on the selected network, from the command palette or the editor context menu (`gno.editorContextMenuCommands.realm`) ([#7](https://github.com/notJoon/vscode-gno/issues/7))


### Bug Fixes

* Gno Add Package To Chain failed with current gnokey, which has no `-deposit` flag. Coins sent with the package are now set with `-send`, and are optional ([#12](https://github.com/notJoon/vscode-gno/pull/12))
* Gno Add Package To Chain shows why a deploy failed, such as `package already exists`, as an error instead of an information message with the exit code ([#7](https://github.com/notJoon/vscode-gno/issues/7))
* the Gno Add Package To Chain editor context menu entry never showed, as `gno.editorContextMenuCommands.addPackage` was shadowed by the `gno.editorContextMenuCommands` object. It is now a property of that object ([#7](https://github.com/notJoon/vscode-gno/issues/7))
* **Gno: Preview Render** previewed the realm of the closest `gnomod.toml` for a file in a subdirectory of it, such as `gno.land/r/demo/foo` for `foo/sub/x.gno`, instead of its own package `gno.land/r/demo/foo/sub` ([#7](https://github.com/notJoon/vscode-gno/issues/7))

## 1.0.2 (2026-11-03)


### Features

* add a debugger for gno packages, driving the gnovm debugger of `gno run` ([#1](https://github.com/notJoon/vscode-gno/pull/1))


### Bug Fixes

* activate the extension when gno is not installed ([#2](https://github.com/notJoon/vscode-gno/pull/2))


### Miscellaneous

* update all dependencies to their latest versions and remove the unused ones. The minimum VS Code version is now 1.91 ([#2](https://github.com/notJoon/vscode-gno/pull/2))
* set up the development tools (Node.js, Go) with mise, also in the GitHub workflows ([#2](https://github.com/notJoon/vscode-gno/pull/2))

## [1.0.1](https://github.com/gnoverse/vscode-gno/compare/v1.0.0...v1.0.1) (2025-09-26)


### Bug Fixes

* base urls and command listing ([#36](https://github.com/gnoverse/vscode-gno/issues/36)) ([4fa4f7d](https://github.com/gnoverse/vscode-gno/commit/4fa4f7d9074f94ee8d9c7f2b71722977253d3e39))

# 1.0.0 (2025-09-22)


### Bug Fixes

* **allTools.ts.in:** updated description and import ([11f25ab](https://github.com/gnoverse/vscode-gno/commit/11f25ab2f9fbd7a710f09bc0d37cfb5df9cc9384))
* auto install gnopls from gnoverse ([801acb5](https://github.com/gnoverse/vscode-gno/commit/801acb57af5e99ed1ee29116dd73bc5dd88031dd))
* auto install gnopls@latest if not installed ([dcd347b](https://github.com/gnoverse/vscode-gno/commit/dcd347bf7e084d561ea6e5757579a457a7c68aed))
* **commands.md:** syntax ([c7acdb7](https://github.com/gnoverse/vscode-gno/commit/c7acdb7b365ffa9e5c29d85cf6b8cdf306849fa4))
* correct bin for install tools with go ([7fda28a](https://github.com/gnoverse/vscode-gno/commit/7fda28a913350c3f9ea4170c177a03387c6f9915))
* err message ([b73d7ee](https://github.com/gnoverse/vscode-gno/commit/b73d7eea38bef079f3523b312676cec7e9bd96e1))
* fix all issues syntax highlighting ([09d22ec](https://github.com/gnoverse/vscode-gno/commit/09d22ec3b3382c193aedb5d417f0907a7c760ef6))
* fix automatic installation of gnopls ([9ddab75](https://github.com/gnoverse/vscode-gno/commit/9ddab75c7674e76c6e61fe98d4372e3b11a51fc3))
* fix bug testing command ([3e48cf6](https://github.com/gnoverse/vscode-gno/commit/3e48cf6acb2a9b1b4b390f68de10932e93cc05fc))
* fix bug, highlighting, icon ([6b1ed82](https://github.com/gnoverse/vscode-gno/commit/6b1ed8293c7e128c5332e4edaaab8f8fc3d167b7))
* format file on save ([9dc08ef](https://github.com/gnoverse/vscode-gno/commit/9dc08ef147c6ae03b8976b82a478ad717fec476a))
* gno version displayed in status bar ([95c8dc5](https://github.com/gnoverse/vscode-gno/commit/95c8dc5cb311ddc07d4cbda3ccd5ff58aba1797e))
* language-configuration ([490be24](https://github.com/gnoverse/vscode-gno/commit/490be24c379603cd0adcfc4172ea4d49ab184259))
* leave go version, waiting for the gno version command not to merge ([9699e89](https://github.com/gnoverse/vscode-gno/commit/9699e8983bbbdfc248ddf68052e00137c4b17850))
* lint fix prettier ([f321945](https://github.com/gnoverse/vscode-gno/commit/f3219453295fe23b727bf7436ece4bb9658ebdb4))
* remove installation of vscgo tools ([bb36501](https://github.com/gnoverse/vscode-gno/commit/bb3650119d2d6d2e6bd1cd3162a4fd28a44aeae9))
* replace go with gno where needed ([76d8df0](https://github.com/gnoverse/vscode-gno/commit/76d8df0608d29df0b215ca89128363da26352484))
* retrieved the gno version based on the implementation of the gno version command ([4915c4e](https://github.com/gnoverse/vscode-gno/commit/4915c4e12b46c8a16f954a7cbcec557ac77e14e9))
* stop ignoring package-lock.json ([b9520a3](https://github.com/gnoverse/vscode-gno/commit/b9520a35eeb25618625e15352f244e0ec0623e73))
* typo in package.json ([531fa2b](https://github.com/gnoverse/vscode-gno/commit/531fa2b70b27165fe41db239f632c503d762ff64))
* upgrade undici version in package-lock.json for fix vulnerability ([dc4847c](https://github.com/gnoverse/vscode-gno/commit/dc4847c0e8b9130dbfb885c47d6a171329172de6))


### Features

* add gno.maketx.addpkg command ([ec1c03a](https://github.com/gnoverse/vscode-gno/commit/ec1c03a24e0466dddd52c4ecbf9cf4f0dd4f9bc5))
* added command gno.toggle.testfile ([8dfef07](https://github.com/gnoverse/vscode-gno/commit/8dfef07f9ad040e1dca17d45ba2796ce7669e982))
* **docs:** add auto generated docs for commands & settings based on package.json ([45c918f](https://github.com/gnoverse/vscode-gno/commit/45c918f47df642d2da56b757a9012659bba1514f))
