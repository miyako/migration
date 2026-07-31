# migration
Resources for porting database applications to 4D

## Code Editor Extensions

### Nova

[**Nova**](https://nova.app) is a native macOS code editor made by Panic, the indie software studio behind apps like Transmit and Coda. Designed specifically for the Mac, Nova takes advantage of native macOS frameworks to deliver a fast, polished editing experience with features like built-in Git integration, a task runner, extensions, and support for multiple panes and tabs.

- [language-4dm-nova](https://github.com/miyako/language-4dm-nova)

|Feature|Implementation|
|-|-|
|Syntax Highlight|`tree-sitter` |
|LSP|`tool4d`|

### TextMate 2

[**TextMate 2**](https://macromates.com) is a general-purpose text editor for macOS, built around fast, keyboard-driven editing and an extensible bundle system.

- [4D.tmbundle](https://github.com/miyako/4D.tmbundle)

|Feature|Implementation|
|-|-|
|Syntax Highlight|`tmLanguage` |

### VS Code

- [language-4dm-vscode](https://github.com/miyako/language-4dm-vscode)

|Feature|Implementation|
|-|-|
|Syntax Highlight|`tmLanguage` |

### Zed

[**Zed**](https://zed.dev) is a modern code editor built from the ground up for speed and collaboration, created by the team behind Atom and Tree-sitter. Written in Rust, it's designed to take full advantage of multi-core processors and GPU rendering, resulting in near-instant startup times and buttery-smooth scrolling and typing, even in large codebases.

- [language-4dm-zed](https://github.com/miyako/language-4dm-zed)

|Feature|Implementation|
|-|-|
|Syntax Highlight|`tree-sitter` |
|LSP|`tool4d`|

## Platforms

### Microsoft Access

Microsoft Access is a database management system developed by Microsoft that combines the relational Microsoft Jet Database Engine with a graphical user interface and software-development tools, allowing users to build databases without needing extensive programming knowledge.

#### Plan 

- port [4d-plugin-mdb](https://github.com/miyako/4d-plugin-mdb) to **rust** with [**jetdb**](https://docs.rs/jetdb/latest/jetdb/) crate
- convert .mdb to .4dcatalog in one shot
- generate example ORDA test code
- create rust-based component template with CI/CD first

#### Status

not started
