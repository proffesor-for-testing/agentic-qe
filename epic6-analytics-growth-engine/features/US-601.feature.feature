@US-601 @EPIC-6 @general
Feature: Analytics & Growth Engine
  As a user
  I want to use Analytics & Growth Engine features
  So that I can achieve my goals effectively

  @TC-FUNC-19EA3814 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that privacy-compliant analytics with GDPR cookie consent implemented
    Given the system is ready to process requests
    When the verify: privacy-compliant analytics with gdpr cookie consent implemented is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-53186C9C @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that content performance dashboard with key metrics (page views, time on page, scroll depth)
    Given the system is ready to process requests
    When the verify: content performance dashboard with key metrics (page views, time on page, scroll depth) is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-4D6442E7 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that conversion tracking for newsletter, membership, contact goals
    Given the system is ready to process requests
    When the verify: conversion tracking for newsletter, membership, contact goals is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-792A0AC2 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that author performance reports with article metrics
    Given the system is ready to process requests
    When the verify: author performance reports with article metrics is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-C820DE80 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that search Console integration for SEO insights
    Given the system is ready to process requests
    When the verify: search console integration for seo insights is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-4C8F1DE5 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that automated monthly report generation
    Given the system is ready to process requests
    When the verify: automated monthly report generation is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-E6C0D7EB @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that real-time "Trending" algorithm based on actual traffic
    Given the system is ready to process requests
    When the verify: real-time "trending" algorithm based on actual traffic is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-9E293158 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that a/B testing capability for content optimization
    Given the system is ready to process requests
    When the verify: a/b testing capability for content optimization is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-OPER-927FAB24 @HTSM:OPERATIONS @HTSM:CommonUse @Priority:P1 @technique:scenario-based
  Scenario: Verify that analytics & Growth Engine
    Given a user with the commonuse profile
    When the user performs the workflow
    Then the workflow completes as expected
