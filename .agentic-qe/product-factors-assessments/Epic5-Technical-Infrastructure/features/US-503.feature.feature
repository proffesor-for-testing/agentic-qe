@US-503 @EPIC-5 @general
Feature: Image optimization pipeline (WebP conversion, responsive images)
  As a user
  I want to use image optimization pipeline (webp conversion, responsive images)
  So that I can achieve my goals

  @TC-OPER-3CD2318D @HTSM:OPERATIONS @HTSM:CommonUse @Priority:P1 @technique:scenario-based
  Scenario: Verify that image optimization pipeline (WebP conversion, responsive images)
    Given a user with the commonuse profile
    When the user performs the workflow
    Then the workflow completes as expected

  @TC-FUNC-096803DB @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P2 @technique:equivalence-partitioning
  Scenario Outline: Verify that image optimization pipeline (WebP conversion, responsive images) is accessible to authorized users
    Given the system is ready to process requests
    When the verify: image optimization pipeline (webp conversion, responsive images) is accessible to authorized users is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-9BEFD318 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P2 @technique:equivalence-partitioning
  Scenario Outline: Verify that image optimization pipeline (WebP conversion, responsive images) handles errors gracefully with user-friendly messages
    Given the system is ready to process requests
    When the verify: image optimization pipeline (webp conversion, responsive images) handles errors gracefully with user-friendly messages is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-FD5DF1B9 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P2 @technique:equivalence-partitioning
  Scenario Outline: Verify that image optimization pipeline (WebP conversion, responsive images) works correctly across all supported browsers
    Given the system is ready to process requests
    When the verify: image optimization pipeline (webp conversion, responsive images) works correctly across all supported browsers is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-113FB552 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P2 @technique:equivalence-partitioning
  Scenario Outline: Verify that image optimization pipeline (WebP conversion, responsive images) is responsive on mobile devices
    Given the system is ready to process requests
    When the verify: image optimization pipeline (webp conversion, responsive images) is responsive on mobile devices is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |
