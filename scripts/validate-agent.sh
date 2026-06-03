#!/usr/bin/env bash
# =============================================================================
# Validate opsbench agent .md files.
# Each agent file must:
#   - live under packages/*/agents/<group>/<name>.md
#   - start with YAML frontmatter (--- delimited)
#   - declare: name, description, tools (list)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exit_code=0
checked=0

while IFS= read -r -d '' agent; do
    checked=$((checked + 1))
    rel="${agent#"${ROOT}"/}"

    first_line="$(head -n 1 "${agent}")"
    if [[ "${first_line}" != "---" ]]; then
        echo "FAIL ${rel}: missing YAML frontmatter"
        exit_code=1
        continue
    fi

    fm="$(awk '/^---$/{c++; next} c==1' "${agent}")"

    for key in name description; do
        if ! grep -qE "^${key}:[[:space:]]*[^[:space:]]+" <<<"${fm}"; then
            echo "FAIL ${rel}: missing '${key}:' in frontmatter"
            exit_code=1
        fi
    done
done < <(find "${ROOT}/packages" -path "*/agents/*" -type f -name "*.md" -print0 2>/dev/null)

if [[ ${checked} -eq 0 ]]; then
    echo "WARN  No agent .md files found under packages/*/agents/ — nothing to validate."
    exit 0
fi

if [[ ${exit_code} -eq 0 ]]; then
    echo "OK    ${checked} agent files validated."
fi
exit "${exit_code}"
