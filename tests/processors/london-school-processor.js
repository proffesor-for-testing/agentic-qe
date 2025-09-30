// Jest test results processor for London School TDD patterns
// Analyzes test results and provides feedback on TDD practices

module.exports = (testResults) => {
  const analysis = {
    londonSchoolCompliance: {
      mockUsage: 0,
      behaviorTests: 0,
      interactionTests: 0,
      stateTests: 0,
      contractTests: 0
    },
    recommendations: [],
    score: 0
  };

  // Analyze test files for London School patterns
  testResults.testResults.forEach(testFile => {
    testFile.testResults.forEach(test => {
      // Check for mock usage patterns
      if (test.title.includes('mock') || test.title.includes('interaction')) {
        analysis.londonSchoolCompliance.mockUsage++;
      }
      
      // Check for behavior-focused tests
      if (test.title.includes('should') && (test.title.includes('when') || test.title.includes('given'))) {
        analysis.londonSchoolCompliance.behaviorTests++;
      }
      
      // Check for interaction testing
      if (test.title.includes('coordinate') || test.title.includes('collaborate') || test.title.includes('communicate')) {
        analysis.londonSchoolCompliance.interactionTests++;
      }
      
      // Check for state testing (discouraged in London School)
      if (test.title.includes('state') || test.title.includes('value') || test.title.includes('property')) {
        analysis.londonSchoolCompliance.stateTests++;
      }
      
      // Check for contract testing
      if (test.title.includes('contract') || test.title.includes('interface') || test.title.includes('satisfy')) {
        analysis.londonSchoolCompliance.contractTests++;
      }
    });
  });

  const totalTests = testResults.numTotalTests;
  
  // Calculate compliance score
  const mockUsageScore = Math.min(analysis.londonSchoolCompliance.mockUsage / totalTests, 1) * 30;
  const behaviorScore = Math.min(analysis.londonSchoolCompliance.behaviorTests / totalTests, 1) * 25;
  const interactionScore = Math.min(analysis.londonSchoolCompliance.interactionTests / totalTests, 1) * 25;
  const contractScore = Math.min(analysis.londonSchoolCompliance.contractTests / totalTests, 1) * 20;
  
  // Penalty for excessive state testing
  const statePenalty = Math.min(analysis.londonSchoolCompliance.stateTests / totalTests, 0.5) * -10;
  
  analysis.score = Math.max(0, mockUsageScore + behaviorScore + interactionScore + contractScore + statePenalty);

  // Generate recommendations
  if (analysis.londonSchoolCompliance.mockUsage / totalTests < 0.7) {
    analysis.recommendations.push('Increase mock usage - London School TDD emphasizes mocking all dependencies');
  }
  
  if (analysis.londonSchoolCompliance.behaviorTests / totalTests < 0.6) {
    analysis.recommendations.push('Focus more on behavior testing - use "should" with "when/given" patterns');
  }
  
  if (analysis.londonSchoolCompliance.interactionTests / totalTests < 0.4) {
    analysis.recommendations.push('Add more interaction tests - verify how objects collaborate');
  }
  
  if (analysis.londonSchoolCompliance.stateTests / totalTests > 0.3) {
    analysis.recommendations.push('Reduce state testing - focus on behavior and interactions instead');
  }
  
  if (analysis.londonSchoolCompliance.contractTests / totalTests < 0.2) {
    analysis.recommendations.push('Add contract tests - verify interface compliance with mocks');
  }

  // Add analysis to test results
  testResults.londonSchoolAnalysis = analysis;
  
  // Print summary
  console.log('\n\u{1F3C5} London School TDD Analysis:');
  console.log(`\u{1F4CA} Compliance Score: ${analysis.score.toFixed(1)}/100`);
  console.log(`\u{1F50D} Mock Usage: ${analysis.londonSchoolCompliance.mockUsage}/${totalTests} tests`);
  console.log(`\u{1F4DD} Behavior Tests: ${analysis.londonSchoolCompliance.behaviorTests}/${totalTests} tests`);
  console.log(`\u{1F91D} Interaction Tests: ${analysis.londonSchoolCompliance.interactionTests}/${totalTests} tests`);
  console.log(`\u{1F4DC} Contract Tests: ${analysis.londonSchoolCompliance.contractTests}/${totalTests} tests`);
  
  if (analysis.londonSchoolCompliance.stateTests > 0) {
    console.log(`\u{26A0}️  State Tests: ${analysis.londonSchoolCompliance.stateTests}/${totalTests} tests (consider reducing)`);
  }
  
  if (analysis.recommendations.length > 0) {
    console.log('\n\u{1F4A1} Recommendations:');
    analysis.recommendations.forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`);
    });
  }
  
  if (analysis.score >= 80) {
    console.log('\n\u{2705} Excellent London School TDD compliance!');
  } else if (analysis.score >= 60) {
    console.log('\n\u{1F44D} Good London School TDD practices - room for improvement');
  } else {
    console.log('\n\u{1F6A8} Consider improving London School TDD practices');
  }

  return testResults;
};
