#!/usr/bin/env npx tsx
/**
 * Apply Supabase Schema Script
 *
 * Runs the pgvector-compatible schema on the connected Supabase instance.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applySchema(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('Run: source .env.supabase');
    process.exit(1);
  }

  console.log('🔧 Applying Supabase Schema...\n');

  // Create admin client with service role key
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Read the schema file
  const schemaPath = join(process.cwd(), 'supabase-schema-pgvector.sql');
  const schemaContent = readFileSync(schemaPath, 'utf-8');

  // Split into individual statements (handle semicolons inside functions)
  const statements = splitSqlStatements(schemaContent);

  console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt || stmt.startsWith('--')) continue;

    // Get a short description of the statement
    const desc = getStatementDescription(stmt);
    process.stdout.write(`  [${i + 1}/${statements.length}] ${desc}... `);

    try {
      const { error } = await supabase.rpc('exec_sql', { query: stmt });

      if (error) {
        // Try direct query via REST API if RPC doesn't exist
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'POST',
          headers: {
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
        });

        // For schema operations, we need to use the SQL Editor or management API
        // Since direct SQL isn't available via REST, output the statement for manual execution
        console.log('⏭️  (manual)');
        errorCount++;
      } else {
        console.log('✅');
        successCount++;
      }
    } catch (err) {
      console.log('⏭️  (manual)');
      errorCount++;
    }
  }

  console.log(`\n📊 Results: ${successCount} succeeded, ${errorCount} need manual execution`);

  if (errorCount > 0) {
    console.log('\n⚠️  Some statements need to be run manually in Supabase SQL Editor.');
    console.log('   Copy the contents of supabase-schema-pgvector.sql and paste into:');
    console.log(`   ${supabaseUrl.replace('.co', '.co/project/').replace('https://', 'https://supabase.com/dashboard/project/')}/sql/new`);
  }
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inFunction = false;
  let dollarQuoteTag = '';

  const lines = sql.split('\n');

  for (const line of lines) {
    // Check for $$ or $tag$ start/end
    const dollarMatch = line.match(/\$([a-zA-Z_]*)\$/);
    if (dollarMatch) {
      if (!inFunction) {
        inFunction = true;
        dollarQuoteTag = dollarMatch[0];
      } else if (line.includes(dollarQuoteTag)) {
        inFunction = false;
        dollarQuoteTag = '';
      }
    }

    current += line + '\n';

    // If we're not in a function and line ends with semicolon, it's end of statement
    if (!inFunction && line.trim().endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

function getStatementDescription(stmt: string): string {
  const lower = stmt.toLowerCase();

  if (lower.startsWith('create extension')) {
    const match = stmt.match(/extension\s+(?:if\s+not\s+exists\s+)?["']?(\w+)/i);
    return `Enable extension: ${match?.[1] || 'unknown'}`;
  }

  if (lower.startsWith('create table')) {
    const match = stmt.match(/table\s+(?:if\s+not\s+exists\s+)?(\w+)/i);
    return `Create table: ${match?.[1] || 'unknown'}`;
  }

  if (lower.startsWith('create index')) {
    const match = stmt.match(/index\s+(?:if\s+not\s+exists\s+)?(\w+)/i);
    return `Create index: ${match?.[1] || 'unknown'}`;
  }

  if (lower.startsWith('create or replace function')) {
    const match = stmt.match(/function\s+(\w+)/i);
    return `Create function: ${match?.[1] || 'unknown'}`;
  }

  if (lower.startsWith('do $$')) {
    return 'Execute anonymous block';
  }

  return stmt.substring(0, 40).replace(/\n/g, ' ') + '...';
}

applySchema().catch(console.error);
