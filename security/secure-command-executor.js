/**
 * Secure Command Executor - Replaces unsafe execSync calls
 * Prevents command injection vulnerabilities by sanitizing inputs
 */

const { execSync, exec } = require('child_process');
const path = require('path');

class SecureCommandExecutor {
    constructor() {
        // Whitelist of allowed commands
        this.allowedCommands = new Set([
            'node', 'npm', 'npx', 'git', 'gh', 'which', 'command',
            'claude', 'where', 'taskkill', 'ps', 'wasm-pack', 'rustc'
        ]);

        // Dangerous patterns to block
        this.dangerousPatterns = [
            /[;&|`$(){}]/,           // Command injection characters
            /\$\([^)]*\)/,           // Command substitution $(cmd)
            /`[^`]*`/,               // Backtick command substitution
            /\|\s*\w+/,              // Pipes to commands
            />\s*\/|<\s*\//,         // Redirects to system files
            /rm\s+-rf/,              // Dangerous rm commands
            /eval\s*\(/,             // Eval function calls
            /exec\s*\(/              // Exec function calls
        ];
    }

    /**
     * Sanitize and validate command arguments
     * @param {string} command - Base command
     * @param {Array} args - Command arguments
     * @returns {Object} - Sanitized command info
     */
    sanitizeCommand(command, args = []) {
        // Extract base command
        const baseCommand = command.split(' ')[0];

        // Check if command is allowed
        if (!this.allowedCommands.has(baseCommand)) {
            throw new Error(`Command not allowed: ${baseCommand}`);
        }

        // Check for dangerous patterns in full command
        const fullCommand = `${command} ${args.join(' ')}`;
        for (const pattern of this.dangerousPatterns) {
            if (pattern.test(fullCommand)) {
                throw new Error(`Dangerous pattern detected in command: ${fullCommand}`);
            }
        }

        // Sanitize arguments
        const sanitizedArgs = args.map(arg => {
            // Remove or escape dangerous characters
            return arg.toString()
                .replace(/[;&|`$(){}]/g, '') // Remove injection chars
                .trim();
        });

        return {
            command: baseCommand,
            args: sanitizedArgs,
            fullCommand: `${baseCommand} ${sanitizedArgs.join(' ')}`
        };
    }

    /**
     * Execute command synchronously with security validation
     * @param {string} command - Command to execute
     * @param {Object} options - Execution options
     * @returns {Buffer|string} - Command output
     */
    execSyncSecure(command, options = {}) {
        try {
            // Parse command and arguments
            const parts = command.split(' ');
            const baseCmd = parts[0];
            const args = parts.slice(1);

            // Sanitize command
            const sanitized = this.sanitizeCommand(baseCmd, args);

            // Set secure default options
            const secureOptions = {
                timeout: 30000,    // 30 second timeout
                maxBuffer: 1024 * 1024, // 1MB max buffer
                stdio: options.stdio || 'pipe',
                ...options
            };

            // Execute with sanitized command
            return execSync(sanitized.fullCommand, secureOptions);

        } catch (error) {
            console.error(`Secure command execution failed: ${error.message}`);
            throw new Error(`Command execution failed: ${error.message}`);
        }
    }

    /**
     * Execute command asynchronously with security validation
     * @param {string} command - Command to execute
     * @param {Object} options - Execution options
     * @param {Function} callback - Callback function
     */
    execSecure(command, options = {}, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        try {
            // Parse and sanitize command
            const parts = command.split(' ');
            const baseCmd = parts[0];
            const args = parts.slice(1);
            const sanitized = this.sanitizeCommand(baseCmd, args);

            // Set secure options
            const secureOptions = {
                timeout: 30000,
                maxBuffer: 1024 * 1024,
                ...options
            };

            // Execute with callback
            return exec(sanitized.fullCommand, secureOptions, callback);

        } catch (error) {
            if (callback) callback(error, null, null);
            else throw error;
        }
    }

    /**
     * Validate file paths to prevent path traversal
     * @param {string} filePath - File path to validate
     * @param {string} basePath - Base path to restrict to
     * @returns {string} - Validated absolute path
     */
    validatePath(filePath, basePath = process.cwd()) {
        // Resolve paths to absolute
        const resolvedBase = path.resolve(basePath);
        const resolvedPath = path.resolve(basePath, filePath);

        // Check if resolved path is within base path
        if (!resolvedPath.startsWith(resolvedBase)) {
            throw new Error(`Path traversal attempt detected: ${filePath}`);
        }

        return resolvedPath;
    }
}

// Create singleton instance
const secureExecutor = new SecureCommandExecutor();

module.exports = {
    SecureCommandExecutor,
    execSyncSecure: secureExecutor.execSyncSecure.bind(secureExecutor),
    execSecure: secureExecutor.execSecure.bind(secureExecutor),
    validatePath: secureExecutor.validatePath.bind(secureExecutor)
};