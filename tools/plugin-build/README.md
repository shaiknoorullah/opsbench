# plugin-build

Assembles `packages/team-*/` into a Claude Code plugin tarball.

## Layout produced

```
opsbench-<version>.tar.gz
└── opsbench/
    └── <version>/
        ├── .claude-plugin/
        │   ├── plugin.json
        │   └── marketplace.json
        ├── skills/
        ├── agents/
        ├── schemas/<team>/
        ├── policies/<team>/
        ├── hooks/<team>/
        ├── mcp-recipes/<team>/
        └── .opsbench-version
```

This mirrors the on-disk layout used by the official Claude Code plugin cache (`~/.claude/plugins/cache/<source>/<plugin>/<version>/`).

## Build

```bash
bash tools/plugin-build/build.sh           # uses version from root package.json
bash tools/plugin-build/build.sh 3.1.0     # explicit version
```

Output is written to `tools/plugin-build/output/`.

## Why a tarball?

There is no public Claude Code plugin marketplace at the time of writing. The tarball is published as a GitHub release asset and can be:

1. Downloaded manually and extracted into `~/.claude/plugins/cache/opsbench/<version>/`.
2. Pulled by `scripts/install.sh` (which currently uses the source tarball, but can be switched to the plugin tarball when the marketplace API stabilizes).
3. Mirrored into a private plugin registry.

The release-it config wires this script as an `after:bump` hook so every release ships a tarball.
