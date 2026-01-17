#!/usr/bin/env npx tsx
/**
 * Migrate local SQLite data to Supabase
 *
 * Transfers existing learning experiences, memory entries, and patterns
 * from local SQLite database to Supabase cloud.
 */

import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function migrate() {
  console.log('🚀 Migrating local data to Supabase...\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Connect to local SQLite
  const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');
  const db = new Database(dbPath, { readonly: true });

  // Connect to Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Create or get project
  console.log('📦 Creating project...');
  const { data: existingProjects } = await supabase
    .from('qe_projects')
    .select('id')
    .eq('name', 'agentic-qe-local')
    .limit(1);

  let projectId: string;
  if (existingProjects && existingProjects.length > 0) {
    projectId = existingProjects[0].id;
    console.log(`   Using existing project: ${projectId}`);
  } else {
    const { data: newProject, error } = await supabase
      .from('qe_projects')
      .insert({
        name: 'agentic-qe-local',
        description: 'Migrated from local SQLite database',
        settings: { defaultPrivacyLevel: 'private', autoShare: false }
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create project:', error.message);
      process.exit(1);
    }
    projectId = newProject.id;
    console.log(`   Created project: ${projectId}`);
  }

  // Migrate Learning Experiences
  console.log('\n📚 Migrating learning experiences...');
  const experiences = db.prepare(`
    SELECT id, agent_id, task_id, task_type, state, action,
           reward, next_state, episode_id, metadata, created_at
    FROM learning_experiences
  `).all() as any[];

  let expSuccess = 0, expFailed = 0;
  for (const exp of experiences) {
    try {
      const context = {
        state: typeof exp.state === 'string' ? JSON.parse(exp.state) : exp.state,
        task_id: exp.task_id,
        episode_id: exp.episode_id
      };
      const outcome = {
        action: typeof exp.action === 'string' ? JSON.parse(exp.action) : exp.action,
        next_state: typeof exp.next_state === 'string' ? JSON.parse(exp.next_state) : exp.next_state,
        reward: exp.reward
      };
      const { error } = await supabase.from('qe_learning_experiences').insert({
        project_id: projectId,
        agent_id: exp.agent_id || 'unknown',
        agent_type: exp.task_type?.split('-')[0] || 'general',
        task_type: exp.task_type || 'unknown',
        context: context,
        outcome: outcome,
        confidence: exp.reward || 0.5,
        privacy_level: 'private',
        created_at: exp.created_at ? new Date(exp.created_at).toISOString() : new Date().toISOString()
      });

      if (error) {
        expFailed++;
        if (expFailed <= 3) console.error(`   Error: ${error.message}`);
      } else {
        expSuccess++;
      }
    } catch (e) {
      expFailed++;
    }
  }
  console.log(`   ✓ ${expSuccess} migrated, ${expFailed} failed`);

  // Migrate Memory Entries
  console.log('\n💾 Migrating memory entries...');
  const memories = db.prepare(`
    SELECT key, value, owner, partition, metadata, created_at, expires_at
    FROM memory_entries
    LIMIT 500
  `).all() as any[];

  let memSuccess = 0, memFailed = 0;
  for (const mem of memories) {
    try {
      const { error } = await supabase.from('qe_memory_entries').upsert({
        project_id: projectId,
        key: mem.key,
        partition: mem.partition || 'default',
        value: typeof mem.value === 'object' ? JSON.stringify(mem.value) : String(mem.value),
        owner: mem.owner || 'system',
        access_level: 'owner',
        metadata: typeof mem.metadata === 'string' ? JSON.parse(mem.metadata || '{}') : mem.metadata || {},
        created_at: mem.created_at ? new Date(mem.created_at).toISOString() : new Date().toISOString(),
        expires_at: mem.expires_at ? new Date(mem.expires_at).toISOString() : null
      }, { onConflict: 'project_id,partition,key' });

      if (error) {
        memFailed++;
        if (memFailed <= 3) console.error(`   Error: ${error.message}`);
      } else {
        memSuccess++;
      }
    } catch (e) {
      memFailed++;
    }
  }
  console.log(`   ✓ ${memSuccess} migrated, ${memFailed} failed`);

  // Migrate Patterns
  console.log('\n🎯 Migrating patterns...');
  const patterns = db.prepare(`
    SELECT type, domain, content, embedding, confidence, usage_count,
           last_used, verdict, metadata, created_at
    FROM patterns
    LIMIT 200
  `).all() as any[];

  let patSuccess = 0, patFailed = 0;
  for (const pat of patterns) {
    try {
      const { error } = await supabase.from('qe_patterns').insert({
        project_id: projectId,
        type: pat.type || 'general',
        domain: pat.domain || 'testing',
        content: pat.content || '',
        confidence: pat.confidence || 0.5,
        usage_count: pat.usage_count || 0,
        last_used: pat.last_used ? new Date(pat.last_used).toISOString() : null,
        verdict: pat.verdict,
        privacy_level: 'private',
        metadata: typeof pat.metadata === 'string' ? JSON.parse(pat.metadata || '{}') : pat.metadata || {},
        created_at: pat.created_at ? new Date(pat.created_at).toISOString() : new Date().toISOString()
      });

      if (error) {
        patFailed++;
        if (patFailed <= 3) console.error(`   Error: ${error.message}`);
      } else {
        patSuccess++;
      }
    } catch (e) {
      patFailed++;
    }
  }
  console.log(`   ✓ ${patSuccess} migrated, ${patFailed} failed`);

  db.close();

  console.log('\n✅ Migration complete!');
  console.log(`   Project ID: ${projectId}`);
}

migrate().catch(console.error);
