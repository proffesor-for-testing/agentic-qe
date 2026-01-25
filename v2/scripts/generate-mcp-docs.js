#!/usr/bin/env node
/**
 * Auto-generate MCP Tools Documentation
 *
 * Extracts tool schemas, JSDoc comments, and type definitions
 * to generate comprehensive markdown documentation.
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract tool definitions from tools.ts
 */
function extractToolDefinitions() {
  const toolsPath = path.join(__dirname, '../src/mcp/tools.ts');
  const toolsContent = fs.readFileSync(toolsPath, 'utf-8');

  // Parse agenticQETools array
  const toolsMatch = toolsContent.match(/export const agenticQETools: Tool\[\] = \[([\s\S]*?)\];/);
  if (!toolsMatch) {
    throw new Error('Could not find agenticQETools definition');
  }

  const toolsArrayContent = toolsMatch[1];

  // Extract individual tools
  const tools = [];
  const toolRegex = /\{[\s\S]*?name: '(mcp__agentic_qe__[\w_]+)'[\s\S]*?description: '([^']*)'[\s\S]*?inputSchema: \{([\s\S]*?)\s*\}\s*\}/g;

  let match;
  while ((match = toolRegex.exec(toolsArrayContent)) !== null) {
    const [, name, description, inputSchema] = match;
    tools.push({
      name,
      description,
      inputSchema: parseInputSchema(inputSchema)
    });
  }

  console.log(`✅ Extracted ${tools.length} tool definitions`);
  return tools;
}

/**
 * Parse inputSchema to extract parameters
 */
function parseInputSchema(schemaStr) {
  const params = [];

  // Extract properties
  const propsMatch = schemaStr.match(/properties: \{([\s\S]*?)\}/);
  if (!propsMatch) return params;

  const propsContent = propsMatch[1];

  // Parse each property
  const propRegex = /(\w+): \{[\s\S]*?type: '(\w+)'[\s\S]*?(?:description: '([^']*)')?[\s\S]*?(?:default: ([^,\n]+))?[\s\S]*?\}/g;

  let match;
  while ((match = propRegex.exec(propsContent)) !== null) {
    const [, name, type, description, defaultValue] = match;
    params.push({
      name,
      type,
      description: description || '',
      default: defaultValue?.trim() || undefined
    });
  }

  // Extract required fields
  const requiredMatch = schemaStr.match(/required: \[([\s\S]*?)\]/);
  const required = requiredMatch
    ? requiredMatch[1].split(',').map(r => r.trim().replace(/['"]/g, ''))
    : [];

  return { params, required };
}

/**
 * Categorize tools
 */
function categorizeTools(tools) {
  const categories = {
    'Fleet Management': [],
    'Test Generation': [],
    'Test Execution': [],
    'Quality Analysis': [],
    'Coverage Analysis': [],
    'Memory Management': [],
    'Coordination': [],
    'Quality Gates': [],
    'Prediction & Risk': [],
    'Performance & Security': [],
    'Requirements & Production': [],
    'Advanced Testing': [],
    'Streaming': []
  };

  tools.forEach(tool => {
    const name = tool.name.replace('mcp__agentic_qe__', '');

    if (name.includes('fleet')) {
      categories['Fleet Management'].push(tool);
    } else if (name.includes('test_generate')) {
      categories['Test Generation'].push(tool);
    } else if (name.includes('test_execute')) {
      categories['Test Execution'].push(tool);
    } else if (name.includes('quality') && !name.includes('gate')) {
      categories['Quality Analysis'].push(tool);
    } else if (name.includes('coverage')) {
      categories['Coverage Analysis'].push(tool);
    } else if (name.includes('memory') || name.includes('blackboard') || name.includes('consensus') || name.includes('artifact')) {
      categories['Memory Management'].push(tool);
    } else if (name.includes('workflow') || name.includes('task') || name.includes('event')) {
      categories['Coordination'].push(tool);
    } else if (name.includes('quality_gate') || name.includes('quality_validate') || name.includes('quality_risk') || name.includes('quality_decision') || name.includes('quality_policy')) {
      categories['Quality Gates'].push(tool);
    } else if (name.includes('predict') || name.includes('flaky') || name.includes('regression') || name.includes('visual_test') || name.includes('deployment')) {
      categories['Prediction & Risk'].push(tool);
    } else if (name.includes('performance') || name.includes('security')) {
      categories['Performance & Security'].push(tool);
    } else if (name.includes('requirements') || name.includes('production') || name.includes('api_breaking') || name.includes('mutation')) {
      categories['Requirements & Production'].push(tool);
    } else if (name.includes('stream')) {
      categories['Streaming'].push(tool);
    } else {
      categories['Advanced Testing'].push(tool);
    }
  });

  // Remove empty categories
  Object.keys(categories).forEach(key => {
    if (categories[key].length === 0) {
      delete categories[key];
    }
  });

  return categories;
}

/**
 * Generate markdown for a tool
 */
function generateToolMarkdown(tool) {
  const name = tool.name.replace('mcp__agentic_qe__', '');
  const { params = [], required = [] } = tool.inputSchema || {};

  let md = `### \`${tool.name}\`\n\n`;
  md += `${tool.description}\n\n`;
  md += `**Status**: Stable\n\n`;

  if (params && params.length > 0) {
    md += `**Parameters**:\n\n`;
    md += `| Name | Type | Required | Default | Description |\n`;
    md += `|------|------|----------|---------|-------------|\n`;

    params.forEach(param => {
      const isRequired = required.includes(param.name) ? 'Yes' : 'No';
      const defaultVal = param.default || '-';
      md += `| ${param.name} | ${param.type} | ${isRequired} | ${defaultVal} | ${param.description} |\n`;
    });

    md += `\n`;
  }

  md += `**Usage Example**:\n\n`;
  md += `\`\`\`javascript\n`;
  md += `const result = await ${tool.name}({\n`;

  if (params.length > 0) {
    const exampleParams = params
      .filter(p => required.includes(p.name))
      .slice(0, 3)
      .map(p => `  ${p.name}: /* ${p.type} */`)
      .join(',\n');
    md += exampleParams;
  }

  md += `\n});\n`;
  md += `\`\`\`\n\n`;

  md += `---\n\n`;

  return md;
}

/**
 * Generate full documentation
 */
function generateDocumentation() {
  console.log('📝 Generating MCP Tools Documentation...\n');

  // Extract tools
  const tools = extractToolDefinitions();

  // Categorize tools
  const categories = categorizeTools(tools);

  // Generate markdown
  let markdown = `# AQE MCP Tools Reference (Auto-Generated)\n\n`;
  markdown += `**Generated**: ${new Date().toISOString()}\n`;
  markdown += `**Total Tools**: ${tools.length}\n\n`;

  markdown += `## Tool Categories\n\n`;
  Object.keys(categories).forEach(category => {
    markdown += `- [${category}](#${category.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '')}) (${categories[category].length} tools)\n`;
  });
  markdown += `\n---\n\n`;

  // Generate each category
  Object.entries(categories).forEach(([category, categoryTools]) => {
    markdown += `## ${category}\n\n`;
    markdown += `**Total**: ${categoryTools.length} tools\n\n`;

    categoryTools.forEach(tool => {
      markdown += generateToolMarkdown(tool);
    });
  });

  // Save documentation
  const docsPath = path.join(__dirname, '../docs/MCP-TOOLS-AUTO-GENERATED.md');
  fs.writeFileSync(docsPath, markdown);

  console.log(`✅ Documentation generated: ${docsPath}`);
  console.log(`   Total tools: ${tools.length}`);
  console.log(`   Categories: ${Object.keys(categories).length}`);

  // Generate summary JSON
  const summary = {
    generated: new Date().toISOString(),
    totalTools: tools.length,
    categories: Object.fromEntries(
      Object.entries(categories).map(([name, tools]) => [name, tools.length])
    ),
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      paramCount: t.inputSchema?.params?.length || 0,
      requiredParams: t.inputSchema?.required?.length || 0
    }))
  };

  const summaryPath = path.join(__dirname, '../docs/mcp-tools-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`✅ Summary generated: ${summaryPath}\n`);

  return { tools, categories, summary };
}

/**
 * Main execution
 */
if (require.main === module) {
  try {
    const result = generateDocumentation();

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ MCP Documentation generation complete!');
    console.log('═══════════════════════════════════════════════════════');

    process.exit(0);
  } catch (error) {
    console.error('❌ Documentation generation failed:', error);
    process.exit(1);
  }
}

module.exports = { generateDocumentation };
