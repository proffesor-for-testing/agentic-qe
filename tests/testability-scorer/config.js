module.exports = {
  baseURL: 'https://talesoftesting.com/',

  // Scoring weights (must sum to 100)
  weights: {
    observability: 15,
    controllability: 15,
    algorithmicSimplicity: 10,
    algorithmicTransparency: 10,
    explainability: 10,
    similarity: 5,
    algorithmicStability: 10,
    unbugginess: 10,
    smallness: 10,
    decomposability: 5
  },

  // Grading scale
  grades: {
    A: 90, B: 80, C: 70, D: 60, F: 0
  },

  // Report settings
  reports: {
    format: ['html', 'json', 'text'],
    directory: 'tests/reports',
    autoOpen: true,
    includeAI: true
  },

  // Browser configuration
  browsers: ['chromium']
};
