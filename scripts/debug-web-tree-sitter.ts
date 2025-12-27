/**
 * Debug script to inspect web-tree-sitter AST structure
 */

import { Parser, Language } from 'web-tree-sitter';
import { join } from 'path';

async function main() {
  console.log('Initializing web-tree-sitter...\n');

  await Parser.init();
  const parser = new Parser();

  // Load TypeScript language
  const wasmPath = join(process.cwd(), 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-typescript.wasm');
  console.log('Loading WASM from:', wasmPath);

  const lang = await Language.load(wasmPath);
  parser.setLanguage(lang);

  // Parse simple code
  const code = `
export class UserService {
  async getUser(id: string): Promise<User | null> {
    return null;
  }
}

function helper() {
  return 42;
}
`;

  console.log('Parsing TypeScript code...\n');
  const tree = parser.parse(code);

  if (!tree) {
    console.error('Failed to parse!');
    return;
  }

  // Print AST structure
  console.log('AST Structure:');
  console.log('==============\n');

  function printNode(node: any, indent: string = '') {
    const hasChildren = node.childCount > 0;
    const text = node.text?.slice(0, 50).replace(/\n/g, '\\n') || '';

    console.log(`${indent}${node.type}${node.isNamed ? ' (named)' : ''} [${node.startPosition.row}:${node.startPosition.column}]`);

    if (!hasChildren && text) {
      console.log(`${indent}  text: "${text}"`);
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        printNode(child, indent + '  ');
      }
    }
  }

  printNode(tree.rootNode);

  // Show the actual node types we're looking for
  console.log('\n\nNode types we are looking for:');
  console.log('- function_declaration');
  console.log('- arrow_function');
  console.log('- class_declaration');
  console.log('- method_definition');
  console.log('- interface_declaration');
  console.log('- type_alias_declaration');

  // Clean up
  tree.delete();
  parser.delete();
}

main().catch(console.error);
