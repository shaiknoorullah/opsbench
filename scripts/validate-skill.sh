#!/usr/bin/env bash
# =============================================================================
# Validate opsbench SKILL.md files.
# Each SKILL.md must:
#   - exist under packages/*/skills/<name>/SKILL.md
#   - start with YAML frontmatter (--- delimited)
#   - declare at minimum: name, description
# Fails non-zero on any violation. Lists ALL failures (does not early-exit).
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exit_code=0
checked=0

while IFS= read -r -d '' skill; do
    checked=$((checked + 1))
    rel="${skill#"${ROOT}"/}"

    # First non-empty line must be ---
    first_line="$(head -n 1 "${skill}")"
    if [[ "${first_line}" != "---" ]]; then
        echo "FAIL ${rel}: missing YAML frontmatter (first line is not '---')"
        exit_code=1
        continue
    fi

    # Extract frontmatter
    fm="$(awk '/^---$/{c++; next} c==1' "${skill}")"

    if ! grep -qE '^name:[[:space:]]*[^[:space:]]+' <<<"${fm}"; then
        echo "FAIL ${rel}: missing 'name:' in frontmatter"
        exit_code=1
    fi
    if ! grep -qE '^description:[[:space:]]*[^[:space:]]+' <<<"${fm}"; then
        echo "FAIL ${rel}: missing 'description:' in frontmatter"
        exit_code=1
    fi
done < <(find "${ROOT}/packages" -type f -name "SKILL.md" -print0 2>/dev/null)

if [[ ${checked} -eq 0 ]]; then
    echo "WARN  No SKILL.md files found under packages/ — nothing to validate."
    exit 0
fi

if [[ ${exit_code} -eq 0 ]]; then
    echo "OK    ${checked} skill files validated."
fi
exit "${exit_code}"
