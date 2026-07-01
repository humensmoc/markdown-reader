# Mermaid Cursor Style Demo

This fixture verifies the Markdown Reader Mermaid baseline:

- Default flowcharts use the reader-level Mermaid config.
- Flowchart edges should read as straight or angular routes, not soft decorative curves.
- Nodes should sit on a restrained dark surface with muted borders.
- Cyan edges and arrowheads should remain easy to follow in Cursor dark themes.
- Fullscreen preview should keep the same visual tone while preserving zoom and drag.

## Default Flowchart

```mermaid
flowchart TD
  A["Markdown file"] --> B["Reader webview"]
  B --> C{"Mermaid block?"}
  C -- "yes" --> D["Build SVG with base theme"]
  D --> E["Dark surface"]
  D --> F["Linear flowchart routes"]
  E --> G["Readable preview"]
  F --> G
  C -- "no" --> H["Render normal code block"]
```

## Sequence Diagram

```mermaid
sequenceDiagram
  participant User
  participant Webview
  participant Mermaid
  User->>Webview: Open Markdown Reader
  Webview->>Mermaid: render(source)
  Mermaid-->>Webview: SVG
  Webview-->>User: Diagram preview
```

## Diagram-Level Curve Override

```mermaid
---
config:
  flowchart:
    curve: stepBefore
---
flowchart LR
  A["Document"] --> B{"Diagram frontmatter"}
  B --> C["Override is preserved"]
  B --> D["Branch keeps step route visible"]
  C --> E["Manual QA checks bends"]
  D --> E
```
