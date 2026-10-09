import { describe, expect, test, tier } from 'claude-code/testing'

import { judge } from '../hooks/guard'
import { ATTACKS } from './corpus/attacks'
import { BENIGN } from './corpus/benign'

tier('user')

describe('learning-data guard corpus', () => {
  test('the corpus is big enough to mean something', () => {
    expect(ATTACKS.length).toBeGreaterThanOrEqual(40)
    expect(BENIGN.length).toBeGreaterThanOrEqual(30)
  })

  test('every attack is refused, as destructive', () => {
    const missed = ATTACKS.filter(c => judge(c.tool, c.input)?.cls !== 'destructive').map(c => c.name)
    expect(missed).toEqual([])
  })

  test('no benign call is refused', () => {
    const noisy = BENIGN.filter(c => judge(c.tool, c.input) !== undefined).map(c => `${c.name}: ${judge(c.tool, c.input)?.reason ?? ''}`)
    expect(noisy).toEqual([])
  })

  test('a refusal says what to do instead and never loosens', () => {
    const r = judge('Bash', { command: 'rm .agentic-qe/memory.db' })
    expect(r?.reason).toContain('aqe-mod refused this')
    expect(r?.reason).toContain('memory.db.bak-')
    expect(judge('Bash', {})).toBeUndefined()
    expect(judge('WebFetch', { url: 'rm .agentic-qe/memory.db' })).toBeUndefined()
  })
})
