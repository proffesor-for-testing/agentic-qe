import { jest } from '@jest/globals';

// London School TDD setup - Mock-first, behavior-driven testing patterns
// This file provides utilities and patterns for London School TDD approach

// London School TDD utilities
global.londonSchool = {
  // Create mock with verification helpers
  createMock: <T>(name: string, implementation?: Partial<T>): jest.Mocked<T> & { _mockName: string } => {
    const mock = {
      _mockName: name,
      ...implementation
    } as jest.Mocked<T> & { _mockName: string };
    
    // Track mock for verification
    if (!global.activeMocks) {
      global.activeMocks = new Set();
    }
    global.activeMocks.add(mock);
    
    return mock;
  },
  
  // Verify all mocks were used (London School principle)
  verifyAllMocksUsed: () => {
    if (!global.activeMocks) return;
    
    const unusedMocks: string[] = [];
    global.activeMocks.forEach((mock: any) => {
      if (mock._mockName && !mock._verified) {
        unusedMocks.push(mock._mockName);
      }
    });
    
    if (unusedMocks.length > 0) {
      console.warn(`London School TDD: Unused mocks detected: ${unusedMocks.join(', ')}`);
    }
  },
  
  // Verify interaction patterns (how objects collaborate)
  verifyInteractionPattern: (mocks: jest.Mocked<any>[], expectedPattern: string[]) => {
    const callOrder: string[] = [];
    
    mocks.forEach(mock => {
      Object.keys(mock).forEach(method => {
        if (jest.isMockFunction(mock[method])) {
          const calls = mock[method].mock.calls;
          calls.forEach((call, index) => {
            callOrder.push(`${mock._mockName || 'unknown'}.${method}`);
          });
        }
      });
    });
    
    expect(callOrder).toEqual(expectedPattern);
  },
  
  // Create contract mock (interface verification)
  createContractMock: <T>(contractName: string, requiredMethods: string[]): jest.Mocked<T> => {
    const mock = {} as jest.Mocked<T>;
    
    requiredMethods.forEach(method => {
      (mock as any)[method] = jest.fn().mockName(`${contractName}.${method}`);
    });
    
    // Add contract verification
    (mock as any)._verifyContract = () => {
      requiredMethods.forEach(method => {
        expect(mock[method as keyof T]).toBeDefined();
        expect(jest.isMockFunction(mock[method as keyof T])).toBe(true);
      });
    };
    
    return mock;
  },
  
  // Verify test follows London School principles
  verifyLondonSchoolPrinciples: (testMetadata: {
    mocksUsed: number;
    stateVerification: boolean;
    behaviorVerification: boolean;
    interactionTesting: boolean;
  }) => {
    // London School tests should:
    // 1. Use mocks for all dependencies
    expect(testMetadata.mocksUsed).toBeGreaterThan(0);
    
    // 2. Focus on behavior, not state
    expect(testMetadata.behaviorVerification).toBe(true);
    
    // 3. Test interactions between objects
    expect(testMetadata.interactionTesting).toBe(true);
    
    // 4. Minimize state verification
    if (testMetadata.stateVerification) {
      console.warn('London School TDD: Consider focusing on behavior rather than state');
    }
  },
  
  // Mock collaboration builder
  mockCollaboration: (collaborators: Array<{ name: string; methods: string[] }>) => {
    const mocks: Record<string, jest.Mocked<any>> = {};
    
    collaborators.forEach(({ name, methods }) => {
      mocks[name] = global.londonSchool.createContractMock(name, methods);
    });
    
    return {
      mocks,
      verifyCollaboration: (expectedInteractions: Array<{ mock: string; method: string; args?: any[] }>) => {
        expectedInteractions.forEach(({ mock, method, args }) => {
          const mockObj = mocks[mock];
          expect(mockObj[method]).toHaveBeenCalled();
          
          if (args) {
            expect(mockObj[method]).toHaveBeenCalledWith(...args);
          }
        });
      }
    };
  },
  
  // Test doubles factory
  createTestDoubles: {
    // Dummy - objects passed around but never used
    dummy: <T>(type: string): T => {
      return { _type: `dummy-${type}` } as T;
    },
    
    // Fake - working implementation but not suitable for production
    fake: <T>(type: string, implementation: Partial<T>): T => {
      return {
        _type: `fake-${type}`,
        ...implementation
      } as T;
    },
    
    // Stub - provides canned answers to calls
    stub: <T>(type: string, responses: Record<string, any>): jest.Mocked<T> => {
      const stub = {} as jest.Mocked<T>;
      
      Object.entries(responses).forEach(([method, response]) => {
        (stub as any)[method] = jest.fn().mockReturnValue(response);
      });
      
      (stub as any)._type = `stub-${type}`;
      return stub;
    },
    
    // Spy - records information about how they were called
    spy: <T>(type: string, implementation?: Partial<T>): jest.Mocked<T> => {
      const spy = { ...implementation } as jest.Mocked<T>;
      
      Object.keys(implementation || {}).forEach(method => {
        if (typeof (spy as any)[method] === 'function') {
          (spy as any)[method] = jest.fn((spy as any)[method]);
        }
      });
      
      (spy as any)._type = `spy-${type}`;
      return spy;
    },
    
    // Mock - pre-programmed with expectations
    mock: <T>(type: string, expectations: Record<string, { args?: any[]; returns?: any; throws?: Error }>): jest.Mocked<T> => {
      const mock = {} as jest.Mocked<T>;
      
      Object.entries(expectations).forEach(([method, expectation]) => {
        const mockFn = jest.fn();
        
        if (expectation.throws) {
          mockFn.mockRejectedValue(expectation.throws);
        } else {
          mockFn.mockReturnValue(expectation.returns);
        }
        
        (mock as any)[method] = mockFn;
      });
      
      (mock as any)._type = `mock-${type}`;
      return mock;
    }
  }
};

// London School test patterns
global.testPatterns = {
  // Outside-In TDD pattern
  outsideIn: {
    // Start with acceptance test
    givenAcceptanceCriteria: (criteria: string) => {
      return {
        when: (action: string) => ({
          then: (expectation: string) => {
            // Framework for outside-in TDD
            console.log(`Given: ${criteria}`);
            console.log(`When: ${action}`);
            console.log(`Then: ${expectation}`);
          }
        })
      };
    }
  },
  
  // Collaboration testing pattern
  collaboration: {
    between: (collaborators: string[]) => ({
      should: (behavior: string) => ({
        when: (scenario: string) => {
          return {
            collaborators,
            behavior,
            scenario,
            verify: (verificationFn: () => void) => verificationFn()
          };
        }
      })
    })
  },
  
  // Interaction testing pattern
  interaction: {
    verify: (description: string, verificationFn: () => void) => {
      it(`should verify interaction: ${description}`, verificationFn);
    },
    
    sequence: (description: string, mocks: jest.Mocked<any>[], expectedSequence: string[]) => {
      it(`should follow interaction sequence: ${description}`, () => {
        global.londonSchool.verifyInteractionPattern(mocks, expectedSequence);
      });
    }
  }
};

// Track active mocks for verification
global.activeMocks = new Set();

// Clean up mocks after each test
afterEach(() => {
  global.londonSchool.verifyAllMocksUsed();
  global.activeMocks?.clear();
});

// Declare global types
declare global {
  var londonSchool: {
    createMock: <T>(name: string, implementation?: Partial<T>) => jest.Mocked<T> & { _mockName: string };
    verifyAllMocksUsed: () => void;
    verifyInteractionPattern: (mocks: jest.Mocked<any>[], expectedPattern: string[]) => void;
    createContractMock: <T>(contractName: string, requiredMethods: string[]) => jest.Mocked<T>;
    verifyLondonSchoolPrinciples: (testMetadata: any) => void;
    mockCollaboration: (collaborators: Array<{ name: string; methods: string[] }>) => any;
    createTestDoubles: {
      dummy: <T>(type: string) => T;
      fake: <T>(type: string, implementation: Partial<T>) => T;
      stub: <T>(type: string, responses: Record<string, any>) => jest.Mocked<T>;
      spy: <T>(type: string, implementation?: Partial<T>) => jest.Mocked<T>;
      mock: <T>(type: string, expectations: Record<string, any>) => jest.Mocked<T>;
    };
  };
  
  var testPatterns: {
    outsideIn: {
      givenAcceptanceCriteria: (criteria: string) => any;
    };
    collaboration: {
      between: (collaborators: string[]) => any;
    };
    interaction: {
      verify: (description: string, verificationFn: () => void) => void;
      sequence: (description: string, mocks: jest.Mocked<any>[], expectedSequence: string[]) => void;
    };
  };
  
  var activeMocks: Set<any>;
}
