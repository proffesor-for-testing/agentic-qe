#!/usr/bin/env python3
"""
Fix import paths in all test files to use TypeScript path aliases
"""

import os
import re
from pathlib import Path

# Define path alias mappings
ALIAS_MAPPINGS = {
    r"from ['\"](\.\./)+src/agents/([^'\"]+)['\"]": r"from '@agents/\2'",
    r"from ['\"](\.\./)+src/core/routing/([^'\"]+)['\"]": r"from '@routing/\2'",
    r"from ['\"](\.\./)+src/core/([^'\"]+)['\"]": r"from '@core/\2'",
    r"from ['\"](\.\./)+src/learning/([^'\"]+)['\"]": r"from '@learning/\2'",
    r"from ['\"](\.\./)+src/reasoning/([^'\"]+)['\"]": r"from '@reasoning/\2'",
    r"from ['\"](\.\./)+src/streaming/([^'\"]+)['\"]": r"from '@streaming/\2'",
    r"from ['\"](\.\./)+src/memory/([^'\"]+)['\"]": r"from '@memory/\2'",
    r"from ['\"](\.\./)+src/mcp/([^'\"]+)['\"]": r"from '@mcp/\2'",
    r"from ['\"](\.\./)+src/cli/([^'\"]+)['\"]": r"from '@cli/\2'",
    r"from ['\"](\.\./)+src/utils/([^'\"]+)['\"]": r"from '@utils/\2'",
    r"from ['\"](\.\./)+src/types([^'\"]*)['\"]": r"from '@types\2'",
}

def fix_imports_in_file(file_path: Path) -> tuple[int, list[str]]:
    """Fix imports in a single file. Returns (num_changes, changed_imports)"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    changes = []

    for pattern, replacement in ALIAS_MAPPINGS.items():
        matches = re.findall(pattern, content)
        if matches:
            new_content = re.sub(pattern, replacement, content)
            if new_content != content:
                # Extract what changed
                old_imports = re.findall(pattern, content)
                for old_import in old_imports:
                    changes.append(f"  Fixed: {pattern} -> {replacement}")
                content = new_content

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return len(changes), changes

    return 0, []

def main():
    """Fix imports in all test files"""
    test_dir = Path('/workspaces/agentic-qe-cf/tests')

    stats = {
        'total_files': 0,
        'files_changed': 0,
        'total_changes': 0,
        'by_directory': {}
    }

    all_changes = []

    # Find all test files
    test_files = list(test_dir.rglob('*.test.ts')) + list(test_dir.rglob('*.spec.ts'))
    stats['total_files'] = len(test_files)

    for file_path in sorted(test_files):
        num_changes, changes = fix_imports_in_file(file_path)

        if num_changes > 0:
            stats['files_changed'] += 1
            stats['total_changes'] += num_changes

            # Track by directory
            rel_dir = file_path.parent.relative_to(test_dir)
            dir_name = str(rel_dir)
            if dir_name not in stats['by_directory']:
                stats['by_directory'][dir_name] = {'files': 0, 'changes': 0}
            stats['by_directory'][dir_name]['files'] += 1
            stats['by_directory'][dir_name]['changes'] += num_changes

            all_changes.append({
                'file': str(file_path.relative_to(test_dir)),
                'changes': num_changes
            })

    # Print summary
    print("=" * 80)
    print("IMPORT PATH FIX SUMMARY")
    print("=" * 80)
    print(f"\nTotal test files analyzed: {stats['total_files']}")
    print(f"Files with changes: {stats['files_changed']}")
    print(f"Total import statements fixed: {stats['total_changes']}")

    print("\n" + "=" * 80)
    print("CHANGES BY DIRECTORY")
    print("=" * 80)
    for dir_name, dir_stats in sorted(stats['by_directory'].items()):
        print(f"\n{dir_name}/")
        print(f"  Files changed: {dir_stats['files']}")
        print(f"  Imports fixed: {dir_stats['changes']}")

    print("\n" + "=" * 80)
    print("FILES MODIFIED (TOP 20)")
    print("=" * 80)
    for change in sorted(all_changes, key=lambda x: x['changes'], reverse=True)[:20]:
        print(f"  {change['file']}: {change['changes']} imports fixed")

    print("\n" + "=" * 80)
    print("COMPLETED SUCCESSFULLY")
    print("=" * 80)

if __name__ == '__main__':
    main()
