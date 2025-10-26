#!/usr/bin/env python3
"""
Fix jest.mock() paths in test files to use TypeScript path aliases
"""

import os
import re
from pathlib import Path

# Define path alias mappings for jest.mock
MOCK_MAPPINGS = {
    r"jest\.mock\(['\"](\.\./)+src/agents/([^'\"]+)['\"]": r"jest.mock('@agents/\2'",
    r"jest\.mock\(['\"](\.\./)+src/core/routing/([^'\"]+)['\"]": r"jest.mock('@routing/\2'",
    r"jest\.mock\(['\"](\.\./)+src/core/([^'\"]+)['\"]": r"jest.mock('@core/\2'",
    r"jest\.mock\(['\"](\.\./)+src/learning/([^'\"]+)['\"]": r"jest.mock('@learning/\2'",
    r"jest\.mock\(['\"](\.\./)+src/reasoning/([^'\"]+)['\"]": r"jest.mock('@reasoning/\2'",
    r"jest\.mock\(['\"](\.\./)+src/memory/([^'\"]+)['\"]": r"jest.mock('@memory/\2'",
    r"jest\.mock\(['\"](\.\./)+src/mcp/([^'\"]+)['\"]": r"jest.mock('@mcp/\2'",
    r"jest\.mock\(['\"](\.\./)+src/cli/([^'\"]+)['\"]": r"jest.mock('@cli/\2'",
    r"jest\.mock\(['\"](\.\./)+src/utils/([^'\"]+)['\"]": r"jest.mock('@utils/\2'",
    r"jest\.mock\(['\"](\.\./)+src/types([^'\"]*)['\"]": r"jest.mock('@types\2'",
}

def fix_mocks_in_file(file_path: Path) -> int:
    """Fix jest.mock paths in a single file. Returns number of changes."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    changes = 0

    for pattern, replacement in MOCK_MAPPINGS.items():
        new_content = re.sub(pattern, replacement, content)
        if new_content != content:
            matches = len(re.findall(pattern, content))
            changes += matches
            content = new_content

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

    return changes

def main():
    """Fix jest.mock paths in all test files"""
    test_dir = Path('/workspaces/agentic-qe-cf/tests')

    total_files = 0
    files_changed = 0
    total_changes = 0

    # Find all test files
    test_files = list(test_dir.rglob('*.test.ts')) + list(test_dir.rglob('*.spec.ts'))

    for file_path in sorted(test_files):
        total_files += 1
        num_changes = fix_mocks_in_file(file_path)

        if num_changes > 0:
            files_changed += 1
            total_changes += num_changes
            print(f"  Fixed {num_changes} jest.mock() in {file_path.relative_to(test_dir)}")

    print("\n" + "=" * 80)
    print("JEST.MOCK() FIX SUMMARY")
    print("=" * 80)
    print(f"Total test files: {total_files}")
    print(f"Files with jest.mock() fixes: {files_changed}")
    print(f"Total jest.mock() statements fixed: {total_changes}")
    print("=" * 80)

if __name__ == '__main__':
    main()
