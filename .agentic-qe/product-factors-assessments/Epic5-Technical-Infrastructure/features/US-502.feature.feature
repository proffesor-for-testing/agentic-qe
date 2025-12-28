@US-502 @EPIC-5 @general
Feature: Security hardening (WAF, rate limiting, 2FA for admins)
  As a administrator
  I want to use security hardening (waf, rate limiting, 2fa for admins)
  So that I can achieve my goals

  @TC-FUNC-7C83A146 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P0 @technique:equivalence-partitioning @critical @smoke
  Scenario Outline: Verify that security audit completed; all critical/high vulnerabilities remediated
    Given the system is ready to process requests
    When the verify: security audit completed; all critical/high vulnerabilities remediated is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-D30A61F7 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P0 @technique:equivalence-partitioning @critical @smoke
  Scenario Outline: Verify that security hardening (WAF, rate limiting, 2FA for admins) is accessible to authorized users
    Given the system is ready to process requests
    When the verify: security hardening (waf, rate limiting, 2fa for admins) is accessible to authorized users is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-92602109 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P0 @technique:equivalence-partitioning @critical @smoke
  Scenario Outline: Verify that security hardening (WAF, rate limiting, 2FA for admins) handles errors gracefully with user-friendly messages
    Given the system is ready to process requests
    When the verify: security hardening (waf, rate limiting, 2fa for admins) handles errors gracefully with user-friendly messages is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-8EC314B4 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P0 @technique:equivalence-partitioning @critical @smoke
  Scenario Outline: Verify that security hardening (WAF, rate limiting, 2FA for admins) works correctly across all supported browsers
    Given the system is ready to process requests
    When the verify: security hardening (waf, rate limiting, 2fa for admins) works correctly across all supported browsers is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-75498E89 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P0 @technique:equivalence-partitioning @critical @smoke
  Scenario Outline: Verify that security hardening (WAF, rate limiting, 2FA for admins) is responsive on mobile devices
    Given the system is ready to process requests
    When the verify: security hardening (waf, rate limiting, 2fa for admins) is responsive on mobile devices is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-OPER-B61CBDA4 @HTSM:OPERATIONS @HTSM:CommonUse @Priority:P1 @technique:scenario-based
  Scenario: Verify that security hardening (WAF, rate limiting, 2FA for admins)
    Given a user with the commonuse profile
    When the user performs the workflow
    Then the workflow completes as expected
