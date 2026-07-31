# Utils packages

This pnpm workspace contains three ESM TypeScript packages:

- `@utils/shared`: platform-independent number, string, and date utilities.
- `@utils/node`: Node.js-only utilities plus selected exports from `@utils/shared`.
- `@utils/browser`: browser-only utilities plus selected exports from `@utils/shared`.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Import the shared package directly when platform-specific helpers are not needed:

```ts
import { clamp, formatDate, truncate } from "@utils/shared";
```

Platform packages also re-export commonly used shared helpers:

```ts
import { clamp, requireEnv } from "@utils/node";
import { formatDate, readStorage } from "@utils/browser";
```

Before publishing, replace the placeholder `@utils` scope in package names,
workspace dependencies, root scripts, and examples with an npm scope you own.
