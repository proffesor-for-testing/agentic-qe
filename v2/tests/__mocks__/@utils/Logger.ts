// Mock Logger for testing
export const Logger = {
  getInstance: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
};
