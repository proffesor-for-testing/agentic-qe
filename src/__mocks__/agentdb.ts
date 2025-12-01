/**
 * Mock for agentdb ESM module
 * Prevents "Unexpected token 'export'" errors in Jest
 */

export const createDatabase = jest.fn().mockImplementation(() => ({
  prepare: jest.fn().mockReturnValue({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn().mockReturnValue([]),
    step: jest.fn().mockReturnValue(false),
    bind: jest.fn(),
    free: jest.fn(),
    getAsObject: jest.fn().mockReturnValue({})
  }),
  exec: jest.fn(),
  run: jest.fn(),
  close: jest.fn()
}));

export class WASMVectorSearch {
  search = jest.fn().mockReturnValue([]);
  add = jest.fn();
  remove = jest.fn();
  clear = jest.fn();
}

export class HNSWIndex {
  private ready = false;

  constructor() {}

  isReady(): boolean {
    return this.ready;
  }

  async build() {
    this.ready = true;
  }

  addVector = jest.fn();
  search = jest.fn().mockReturnValue([]);
  remove = jest.fn();
  clear = jest.fn();
}

export const AgentDB = {
  initialize: jest.fn().mockResolvedValue(undefined),
  getStats: jest.fn().mockResolvedValue({
    patterns: { count: 0 },
    sessions: { count: 0 },
    embeddings: { dimension: 384 }
  }),
  close: jest.fn().mockResolvedValue(undefined)
};

export default {
  createDatabase,
  WASMVectorSearch,
  HNSWIndex,
  AgentDB
};
