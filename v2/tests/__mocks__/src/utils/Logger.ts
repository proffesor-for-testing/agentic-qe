// Mock Logger for testing
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

export const Logger = {
  getInstance: () => mockLogger
};
