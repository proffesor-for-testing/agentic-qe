@US-401 @EPIC-4 @general
Feature: Sustainable Commerce & Transparency Features
  As a user
  I want to use Sustainable Commerce & Transparency Features features
  So that I can achieve my goals effectively

  @TC-FUNC-B4939CC3 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that sustainable/eco-friendly product filter visible on homepage
    Given the system is ready to process requests
    When the verify: sustainable/eco-friendly product filter visible on homepage is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-6E0D9884 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that "Responsible Collection" featured section on homepage
    Given the system is ready to process requests
    When the verify: "responsible collection" featured section on homepage is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-326D19BC @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that carbon footprint estimates displayed for delivery OPTIONS
    Given the system is ready to process requests
    When the verify: carbon footprint estimates displayed for delivery options is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-45DDB705 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that "Pre-loved" / resale section prominently linked from homepage
    Given the system is ready to process requests
    When the verify: "pre-loved" / resale section prominently linked from homepage is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-FUNC-3448E497 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:decision-table
  Scenario Outline: Verify that sustainability badges/certifications visible on product cards
    Given the system is ready to process requests
    When the verify: sustainability badges/certifications visible on product cards is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | condition1      | condition2      | expectedResult  |
      | true            | true            | result_A        |
      | true            | false           | result_B        |
      | false           | true            | result_C        |
      | false           | false           | result_D        |

  @TC-FUNC-10A7D668 @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:boundary-value-analysis
  Scenario Outline: Verify that link to CR report and ethical sourcing information in footer elevated
    Given the system is ready to process requests
    When the verify: link to cr report and ethical sourcing information in footer elevated is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | value_type    | value           |
      | min           | minimum_value   |
      | justAboveMin  | min + 1         |
      | nominal       | typical_value   |
      | justBelowMax  | max - 1         |
      | max           | maximum_value   |

  @TC-FUNC-DCEAE67F @HTSM:FUNCTION @HTSM:BusinessRules @Priority:P1 @technique:equivalence-partitioning
  Scenario Outline: Verify that "Repair & Care" guides linked from homepage
    Given the system is ready to process requests
    When the verify: "repair & care" guides linked from homepage is executed
    Then the operation completes successfully
    And the expected output is produced

    Examples:
      | partition | value                       |
      | valid     | representative_valid_value  |
      | invalid   | representative_invalid_value |

  @TC-OPER-6A9DDD6E @HTSM:OPERATIONS @HTSM:CommonUse @Priority:P1 @technique:scenario-based
  Scenario: Verify that sustainable Commerce & Transparency Features
    Given a user with the commonuse profile
    When the user performs the workflow
    Then the workflow completes as expected
