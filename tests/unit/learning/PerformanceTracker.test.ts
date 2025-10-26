// Mock Logger to prevent undefined errors
jest.mock('@utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }))
  }
}));

// Mock Logger to prevent undefined errors
