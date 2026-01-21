module.exports = {
  // Runtime URL override via TEST_URL environment variable
  baseURL: process.env.TEST_URL || 'https://huibschoots.nl/',
  
  weights: {
    observability: 15,
    controllability: 15,
    algorithmicSimplicity: 10,
    algorithmicTransparency: 10,
    algorithmicStability: 10,
    explainability: 10,
    unbugginess: 10,
    smallness: 10,
    decomposability: 5,
    similarity: 5
  },
  
  reports: {
    directory: 'tests/reports'
  }
};
