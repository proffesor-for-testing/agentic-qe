# Security Policy

## Supported Versions

The Agentic QE project maintains security updates for the following versions:

| Version | Supported          | Notes                                    |
| ------- | ------------------ | ---------------------------------------- |
| 1.2.x   | :white_check_mark: | Current stable release                   |
| 1.1.x   | :white_check_mark: | Maintained with critical security fixes  |
| 1.0.x   | :x:                | Upgrade to 1.2.x recommended             |
| < 1.0   | :x:                | No longer supported                      |

**Recommendation**: Always use the latest stable version (1.2.x) to ensure you have the most recent security patches and improvements.

---

## Security Features

### Built-in Security Measures

The Agentic QE framework includes several security features by default:

#### 1. **AgentDB Integration Security** (v1.2.0+)
- **TLS 1.3 Encryption**: All QUIC connections use TLS 1.3 by default
- - **Certificate Validation**: Mandatory certificate validation for all connections
  - - **Connection Authentication**: Secure agent-to-agent communication
    - - **Sub-millisecond Latency**: <1ms secure communication overhead
     
      - #### 2. **Dependency Security**
      - - **Regular Audits**: Automated dependency vulnerability scanning
        - - **Minimal Dependencies**: 89 packages removed in v1.2.0 (7.3MB reduction)
          - - **Trusted Sources**: All dependencies from verified npm registry sources
            - - **Lock File**: `package-lock.json` ensures reproducible builds
             
              - #### 3. **Data Protection**
              - - **Local Storage**: SQLite database stored locally (`.aqe/memory.db`)
                - - **No External Transmissions**: Learning data and patterns stay on your system
                  - - **Encryption at Rest**: Optional database encryption for sensitive data
                    - - **Memory Isolation**: Agent memory stores are isolated by agent ID
                     
                      - #### 4. **API Security**
                      - - **Authentication**: Optional API key authentication for MCP server
                        - - **Rate Limiting**: Built-in rate limiting for API endpoints
                          - - **CORS Configuration**: Configurable cross-origin resource sharing
                            - - **Input Validation**: All API inputs are validated and sanitized
                             
                              - #### 5. **Code Security**
                              - - **TypeScript**: Strong typing prevents many common vulnerabilities
                                - - **No Eval**: Zero use of `eval()` or dynamic code execution
                                  - - **Input Sanitization**: All external inputs are validated
                                    - - **Path Traversal Protection**: Safe file system operations
                                     
                                      - ---

                                      ## Reporting a Vulnerability

                                      We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

                                      ### 1. **DO NOT** Open a Public Issue

                                      Security vulnerabilities should **not** be reported through public GitHub issues to prevent exploitation before a fix is available.

                                      ### 2. Report via Private Channel

                                      **Email**: security@agentic-qe.com
                                      **Subject**: `[SECURITY] Brief description of issue`

                                      **Include in your report:**
                                      - Description of the vulnerability
                                      - - Steps to reproduce the issue
                                        - - Potential impact and severity assessment
                                          - - Affected versions
                                            - - Any suggested fixes (if applicable)
                                              - - Your contact information for follow-up
                                               
                                                - ### 3. Response Timeline
                                               
                                                - | Timeline | Action                                                |
                                                - | -------- | ----------------------------------------------------- |
                                                - | 24 hours | Acknowledgment of your report                         |
                                                - | 7 days   | Initial assessment and severity classification        |
                                                - | 30 days  | Fix development and testing (for critical issues)     |
                                                - | 90 days  | Public disclosure (after patch release)               |
                                               
                                                - ### 4. Severity Classification
                                               
                                                - We use the following severity levels:
                                               
                                                - - **CRITICAL**: Remote code execution, authentication bypass, data breach
                                                  - - **HIGH**: Privilege escalation, SQL injection, XSS
                                                    - - **MEDIUM**: Information disclosure, denial of service
                                                      - - **LOW**: Minor information leaks, non-exploitable bugs
                                                       
                                                        - ### 5. Security Advisory Process
                                                       
                                                        - 1. **Private Fix**: We develop and test the fix privately
                                                          2. 2. **Security Advisory**: We create a GitHub Security Advisory
                                                             3. 3. **Patch Release**: We release a patched version
                                                                4. 4. **Public Disclosure**: We publish the advisory with details
                                                                   5. 5. **Credit**: We credit the reporter (unless they prefer anonymity)
                                                                     
                                                                      6. ---
                                                                     
                                                                      7. ## Security Best Practices
                                                                     
                                                                      8. ### For Users
                                                                     
                                                                      9. #### 1. **Keep Dependencies Updated**
                                                                      10. ```bash
                                                                          # Check for updates
                                                                          npm outdated

                                                                          # Update to latest stable version
                                                                          npm update agentic-qe

                                                                          # Audit dependencies
                                                                          npm audit
                                                                          npm audit fix
                                                                          ```

                                                                          #### 2. **Secure Configuration**
                                                                          ```yaml
                                                                          # config/fleet.yaml - Production settings
                                                                          security:
                                                                            # Enable TLS 1.3 for all connections
                                                                            tlsVersion: "1.3"

                                                                            # Require certificate validation
                                                                            validateCertificates: true

                                                                            # Enable database encryption
                                                                            databaseEncryption: true
                                                                            encryptionKey: "${AQE_DB_ENCRYPTION_KEY}" # Use environment variable

                                                                            # API authentication
                                                                            apiAuth:
                                                                              enabled: true
                                                                              apiKey: "${AQE_API_KEY}" # Use environment variable

                                                                            # Rate limiting
                                                                            rateLimit:
                                                                              enabled: true
                                                                              maxRequests: 100
                                                                              windowMs: 60000 # 1 minute
                                                                          ```

                                                                          #### 3. **Environment Variables**
                                                                          ```bash
                                                                          # .env - NEVER commit this file
                                                                          AQE_DB_ENCRYPTION_KEY=your-secure-random-key-here
                                                                          AQE_API_KEY=your-secure-api-key-here

                                                                          # Use strong random keys
                                                                          openssl rand -base64 32
                                                                          ```

                                                                          #### 4. **File Permissions**
                                                                          ```bash
                                                                          # Secure your configuration files
                                                                          chmod 600 .env
                                                                          chmod 600 config/fleet.yaml
                                                                          chmod 700 .aqe/

                                                                          # Verify permissions
                                                                          ls -la .env config/ .aqe/
                                                                          ```

                                                                          #### 5. **AI Model API Keys**
                                                                          ```bash
                                                                          # Store API keys securely in environment variables
                                                                          export OPENAI_API_KEY="sk-..."
                                                                          export ANTHROPIC_API_KEY="sk-ant-..."

                                                                          # Never hardcode in configuration files
                                                                          # Never commit to version control
                                                                          ```

                                                                          #### 6. **Network Security**
                                                                          ```yaml
                                                                          # Restrict API access
                                                                          api:
                                                                            host: "127.0.0.1" # Localhost only
                                                                            port: 3000

                                                                            # Or use specific IP whitelist
                                                                            allowedIPs:
                                                                              - "192.168.1.0/24"
                                                                              - "10.0.0.0/8"
                                                                          ```

                                                                          #### 7. **Audit Logging**
                                                                          ```yaml
                                                                          # Enable comprehensive audit logging
                                                                          logging:
                                                                            level: "info"
                                                                            auditLog: true
                                                                            auditFile: ".aqe/audit.log"

                                                                            # Log sensitive operations
                                                                            auditEvents:
                                                                              - "agent_spawn"
                                                                              - "database_access"
                                                                              - "pattern_export"
                                                                              - "api_access"
                                                                          ```

                                                                          ### For Contributors

                                                                          #### 1. **Code Review Requirements**
                                                                          - All PRs require security review for changes to:
                                                                          -   - Authentication/authorization logic
                                                                              -   - Database operations
                                                                                  -   - File system operations
                                                                                      -   - Network communications
                                                                                          -   - External API integrations
                                                                                           
                                                                                              - #### 2. **Security Testing**
                                                                                              - ```bash
                                                                                                # Run security tests before committing
                                                                                                npm run test:security

                                                                                                # Check for common vulnerabilities
                                                                                                npm audit

                                                                                                # Static analysis
                                                                                                npm run lint:security
                                                                                                ```

                                                                                                #### 3. **Secure Coding Guidelines**
                                                                                                - **Input Validation**: Validate all user inputs and external data
                                                                                                - - **Output Encoding**: Encode output to prevent injection attacks
                                                                                                  - - **Parameterized Queries**: Use parameterized queries for database operations
                                                                                                    - - **Least Privilege**: Grant minimum necessary permissions
                                                                                                      - - **Error Handling**: Never expose sensitive information in error messages
                                                                                                        - - **Dependency Management**: Keep dependencies updated and audited
                                                                                                         
                                                                                                          - #### 4. **Pre-commit Hooks**
                                                                                                          - ```bash
                                                                                                            # Install security pre-commit hooks
                                                                                                            npm run setup:security-hooks

                                                                                                            # Hooks will automatically:
                                                                                                            # - Run npm audit
                                                                                                            # - Check for hardcoded secrets
                                                                                                            # - Validate file permissions
                                                                                                            # - Run security linters
                                                                                                            ```
                                                                                                            
                                                                                                            ---
                                                                                                            
                                                                                                            ## Known Security Considerations
                                                                                                            
                                                                                                            ### 1. **AI Model API Keys**
                                                                                                            **Risk**: AI model API keys (OpenAI, Anthropic, etc.) grant access to paid services.
                                                                                                            
                                                                                                            **Mitigation**:
                                                                                                            - Store keys in environment variables only
                                                                                                            - - Never commit keys to version control
                                                                                                              - - Use `.gitignore` to exclude `.env` files
                                                                                                                - - Rotate keys regularly
                                                                                                                  - - Monitor API usage for anomalies
                                                                                                                    - - Set spending limits in provider dashboards
                                                                                                                     
                                                                                                                      - ### 2. **Test Data**
                                                                                                                      - **Risk**: Test data generation might create sensitive-looking data.
                                                                                                                     
                                                                                                                      - **Mitigation**:
                                                                                                                      - - Generated test data is synthetic and not real
                                                                                                                        - - Configure data generation to avoid realistic PII
                                                                                                                          - - Use faker libraries with non-sensitive seeds
                                                                                                                            - - Document that test data is for testing only
                                                                                                                             
                                                                                                                              - ### 3. **Database Storage**
                                                                                                                              - **Risk**: SQLite database stores agent learning data and patterns.
                                                                                                                             
                                                                                                                              - **Mitigation**:
                                                                                                                              - - Database is stored locally (not transmitted)
                                                                                                                                - - Enable encryption for sensitive environments
                                                                                                                                  - - Set appropriate file permissions (600)
                                                                                                                                    - - Exclude from backups to untrusted locations
                                                                                                                                      - - Regular cleanup of old data
                                                                                                                                       
                                                                                                                                        - ### 4. **MCP Server**
                                                                                                                                        - **Risk**: MCP server exposes API endpoints for agent coordination.
                                                                                                                                       
                                                                                                                                        - **Mitigation**:
                                                                                                                                        - - Bind to localhost (127.0.0.1) by default
                                                                                                                                          - - Enable API key authentication in production
                                                                                                                                            - - Use rate limiting to prevent abuse
                                                                                                                                              - - Deploy behind reverse proxy in production
                                                                                                                                                - - Enable HTTPS for remote access
                                                                                                                                                 
                                                                                                                                                  - ### 5. **Pattern Sharing**
                                                                                                                                                  - **Risk**: Exported patterns might contain project-specific information.
                                                                                                                                                 
                                                                                                                                                  - **Mitigation**:
                                                                                                                                                  - - Review patterns before sharing externally
                                                                                                                                                    - - Patterns contain code structure, not secrets
                                                                                                                                                      - - Option to sanitize patterns before export
                                                                                                                                                        - - Document pattern privacy in sharing features
                                                                                                                                                         
                                                                                                                                                          - ### 6. **Log Files**
                                                                                                                                                          - **Risk**: Logs might contain sensitive operational data.
                                                                                                                                                         
                                                                                                                                                          - **Mitigation**:
                                                                                                                                                          - - Configure log levels appropriately
                                                                                                                                                            - - Exclude sensitive data from logs
                                                                                                                                                              - - Rotate and archive logs regularly
                                                                                                                                                                - - Secure log file permissions (600)
                                                                                                                                                                  - - Use structured logging for easier filtering
                                                                                                                                                                   
                                                                                                                                                                    - ---
                                                                                                                                                                    
                                                                                                                                                                    ## Compliance
                                                                                                                                                                    
                                                                                                                                                                    ### OWASP Compliance
                                                                                                                                                                    - **Current Status**: 90%+ compliance (improved from 70% in v1.1.0)
                                                                                                                                                                    - - **OWASP Top 10**: Addressed all critical categories
                                                                                                                                                                      - - **Testing**: Regular OWASP ZAP scans
                                                                                                                                                                        - - **Documentation**: Security controls documented
                                                                                                                                                                         
                                                                                                                                                                          - ### Data Protection
                                                                                                                                                                          - - **GDPR**: Test data generator supports GDPR-compliant synthetic data
                                                                                                                                                                            - - **Data Residency**: All data stored locally by default
                                                                                                                                                                              - - **Data Portability**: Export/import functionality for all data
                                                                                                                                                                                - - **Right to Deletion**: Easy data cleanup and removal
                                                                                                                                                                                 
                                                                                                                                                                                  - ### Open Source Security
                                                                                                                                                                                  - - **SPDX License**: MIT License (SPDX-License-Identifier: MIT)
                                                                                                                                                                                    - - **CycloneDX SBOM**: Software Bill of Materials available
                                                                                                                                                                                      - - **Vulnerability Disclosure**: Coordinated disclosure policy
                                                                                                                                                                                        - - **Security Champions**: Designated security maintainers
                                                                                                                                                                                         
                                                                                                                                                                                          - ---
                                                                                                                                                                                          
                                                                                                                                                                                          ## Security Updates
                                                                                                                                                                                          
                                                                                                                                                                                          ### Staying Informed
                                                                                                                                                                                          
                                                                                                                                                                                          - **GitHub Security Advisories**: Watch this repository for security advisories
                                                                                                                                                                                          - - **Release Notes**: Check `CHANGELOG.md` for security fixes
                                                                                                                                                                                            - - **Email Updates**: Subscribe to security@agentic-qe.com for critical alerts
                                                                                                                                                                                              - - **Twitter**: Follow [@AgenticQE](https://twitter.com/AgenticQE) for announcements
                                                                                                                                                                                               
                                                                                                                                                                                                - ### Update Notifications
                                                                                                                                                                                               
                                                                                                                                                                                                - ```bash
                                                                                                                                                                                                  # Check for security updates
                                                                                                                                                                                                  npm outdated agentic-qe

                                                                                                                                                                                                  # View security advisories
                                                                                                                                                                                                  npm audit

                                                                                                                                                                                                  # Update with security fixes
                                                                                                                                                                                                  npm update agentic-qe
                                                                                                                                                                                                  ```
                                                                                                                                                                                                  
                                                                                                                                                                                                  ---
                                                                                                                                                                                                  
                                                                                                                                                                                                  ## Security Contacts
                                                                                                                                                                                                  
                                                                                                                                                                                                  - **Security Team**: security@agentic-qe.com
                                                                                                                                                                                                  - - **General Support**: support@agentic-qe.com
                                                                                                                                                                                                    - - **Maintainers**: See [CODEOWNERS](./CODEOWNERS) file
                                                                                                                                                                                                     
                                                                                                                                                                                                      - ### PGP Key
                                                                                                                                                                                                      - For encrypted communications, use our PGP key:
                                                                                                                                                                                                     
                                                                                                                                                                                                      - ```
                                                                                                                                                                                                        Fingerprint: [To be added]
                                                                                                                                                                                                        Key ID: [To be added]
                                                                                                                                                                                                        Download: https://keys.openpgp.org/search?q=security@agentic-qe.com
                                                                                                                                                                                                        ```
                                                                                                                                                                                                        
                                                                                                                                                                                                        ---
                                                                                                                                                                                                        
                                                                                                                                                                                                        ## Acknowledgments
                                                                                                                                                                                                        
                                                                                                                                                                                                        We appreciate the security research community's efforts. Security researchers who responsibly disclose vulnerabilities will be:
                                                                                                                                                                                                        
                                                                                                                                                                                                        - Credited in release notes (unless anonymity is preferred)
                                                                                                                                                                                                        - - Listed in our [SECURITY-HALL-OF-FAME.md](./docs/SECURITY-HALL-OF-FAME.md) (coming soon)
                                                                                                                                                                                                          - - Eligible for recognition in our documentation
                                                                                                                                                                                                           
                                                                                                                                                                                                            - **Thank you for helping keep Agentic QE secure!**
                                                                                                                                                                                                           
                                                                                                                                                                                                            - ---
                                                                                                                                                                                                            
                                                                                                                                                                                                            ## Additional Resources
                                                                                                                                                                                                            
                                                                                                                                                                                                            - [Contributing Guide](./CONTRIBUTING.md) - Contribution guidelines including security
                                                                                                                                                                                                            - - [Documentation](./docs/) - Complete documentation
                                                                                                                                                                                                              - - [OWASP Top 10](https://owasp.org/www-project-top-ten/) - OWASP security standards
                                                                                                                                                                                                                - - [npm Security Best Practices](https://docs.npmjs.com/security-best-practices) - npm security
                                                                                                                                                                                                                 
                                                                                                                                                                                                                  - ---
                                                                                                                                                                                                                  
                                                                                                                                                                                                                  **Last Updated**: October 22, 2025
                                                                                                                                                                                                                  **Version**: 1.2.0
