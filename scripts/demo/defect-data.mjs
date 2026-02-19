// Dummy automotive defect dataset for AQE capability demo
// Domain: Automotive (BMW, Mercedes-Benz style systems)

export const defectGuidelines = {
  mandatoryFields: [
    'title', 'severity', 'stepsToReproduce', 'expectedBehavior',
    'actualBehavior', 'environment', 'component', 'reportedBy'
  ],
  severityValues: ['Critical', 'High', 'Medium', 'Low', 'Trivial'],
  environmentFields: ['vehicle_model', 'software_version', 'ecu_firmware', 'region'],
  qualityRules: [
    { field: 'title', rule: 'Must be 15-200 chars, format: [Component] Action causing Impact' },
    { field: 'stepsToReproduce', rule: 'Minimum 2 steps required' },
    { field: 'expectedBehavior', rule: 'Minimum 10 characters' },
    { field: 'actualBehavior', rule: 'Minimum 10 characters' },
    { field: 'environment', rule: 'Must include vehicle_model and software_version' },
  ]
};

// --- SECTION 1: Defect Quality Check ---

export const poorQualityDefect = {
  id: 'DEF-4821',
  title: 'Nav broken',
  severity: '',
  component: '',
  stepsToReproduce: [],
  expectedBehavior: '',
  actualBehavior: 'Not working',
  environment: {},
  reportedBy: 'J. Mueller',
  reportedDate: '2025-11-18',
  attachments: [],
  tags: []
};

export const goodQualityDefect = {
  id: 'DEF-4822',
  title: '[Navigation] Route recalculation fails on highway exit causing missed turns',
  severity: 'High',
  component: 'Navigation / Route Engine',
  stepsToReproduce: [
    'Start navigation to destination with highway route (e.g., Munich to Stuttgart via A8)',
    'Drive past the designated highway exit at speed > 120 km/h',
    'Observe that the system attempts route recalculation',
    'System freezes for 8-12 seconds showing "Recalculating..." spinner',
    'After timeout, route resets to original path ignoring missed exit'
  ],
  expectedBehavior: 'Navigation should recalculate alternative route within 2 seconds using the next available exit, with voice prompt: "Route recalculated, take next exit in X km"',
  actualBehavior: 'System freezes for 8-12 seconds during recalculation. After timeout, it resets to original route instead of finding alternative. No voice prompt is given. In 30% of cases, the navigation module crashes and requires manual restart via iDrive controller.',
  environment: {
    vehicle_model: 'BMW 5 Series (G60) 2025',
    software_version: 'iDrive 8.5 (v23.11.2-prod)',
    ecu_firmware: 'HU-H3 v4.2.1',
    region: 'EU-Central (Germany)',
    connectivity: 'LTE Active',
    map_version: 'HERE Maps Q3-2025'
  },
  reportedBy: 'K. Schneider',
  reportedDate: '2025-11-20',
  reproducibility: 'always',
  affectedUsers: '~12,000 (EU G60 fleet with iDrive 8.5)',
  attachments: ['nav-crash-log-20251120.txt', 'route-trace-a8.gpx'],
  tags: ['navigation', 'route-engine', 'freeze', 'highway']
};

// --- SECTION 2: Duplicate Defect Detection ---

export const existingDefects = [
  {
    id: 'DEF-3901',
    title: '[Navigation] Route guidance freezes when missing motorway junction',
    severity: 'High',
    component: 'Navigation / Route Engine',
    description: 'The navigation route guidance module becomes unresponsive for 10+ seconds when the driver misses a motorway junction. The route recalculation engine appears to enter a deadlock state when processing high-speed route deviation events. Affects iDrive 8.x on G-series vehicles.',
    status: 'open',
    reportedDate: '2025-09-15',
    tags: ['navigation', 'freeze', 'motorway', 'route-recalculation']
  },
  {
    id: 'DEF-4102',
    title: '[ADAS] Lane Keep Assist disengages in heavy rain without driver warning',
    severity: 'Critical',
    component: 'ADAS / Lane Keep Assist',
    description: 'Lane Keep Assist (LKA) silently disengages when front camera visibility drops below 40% due to heavy rain. No audible or visual warning is given to the driver. Steering torque feedback ceases immediately. Affected on all camera-based ADAS configurations.',
    status: 'open',
    reportedDate: '2025-10-02',
    tags: ['adas', 'lka', 'safety', 'rain', 'camera']
  },
  {
    id: 'DEF-4205',
    title: '[Infotainment] Bluetooth audio stuttering after phone call ends',
    severity: 'Medium',
    component: 'Infotainment / Bluetooth',
    description: 'After ending a hands-free phone call, Bluetooth audio streaming (A2DP) exhibits stuttering and dropouts for 30-60 seconds. The audio codec appears to fail switching from HFP back to A2DP cleanly. Affects both Android and iOS devices.',
    status: 'resolved',
    reportedDate: '2025-08-20',
    tags: ['bluetooth', 'audio', 'phone', 'a2dp']
  },
  {
    id: 'DEF-4310',
    title: '[Telematics] OTA update fails silently on vehicles with low 12V battery',
    severity: 'High',
    component: 'Telematics / OTA Update',
    description: 'Over-the-air software updates initiate but fail silently when 12V battery voltage is below 12.2V. No error is reported to the backend or displayed to the user. The vehicle reports "update successful" despite partial installation. Can leave ECUs in inconsistent firmware state.',
    status: 'open',
    reportedDate: '2025-10-28',
    tags: ['ota', 'battery', 'firmware', 'telematics']
  },
  {
    id: 'DEF-4455',
    title: '[Climate] Seat heating remains on max after remote pre-conditioning ends',
    severity: 'Low',
    component: 'Climate Control / Seat Heating',
    description: 'When remote pre-conditioning is activated via the Mercedes me app and the timer expires, the seat heating remains at maximum level instead of reverting to the last manual setting. Energy consumption increases and occupant may experience discomfort on entry.',
    status: 'open',
    reportedDate: '2025-11-05',
    tags: ['climate', 'seat-heating', 'remote', 'pre-conditioning']
  },
  {
    id: 'DEF-4512',
    title: '[Navigation] Map rendering lag causes route overlay to disappear at high speed',
    severity: 'Medium',
    component: 'Navigation / Map Renderer',
    description: 'At speeds above 160 km/h, the map tile rendering cannot keep up with position updates. The route overlay line disappears for 2-3 seconds while new tiles load. GPS position dot jumps ahead of rendered map. Occurs on both 2D and 3D map views.',
    status: 'open',
    reportedDate: '2025-11-10',
    tags: ['navigation', 'map', 'rendering', 'high-speed', 'performance']
  },
  {
    id: 'DEF-4601',
    title: '[ADAS] Adaptive cruise control phantom braking in tunnel transitions',
    severity: 'Critical',
    component: 'ADAS / Adaptive Cruise Control',
    description: 'Adaptive Cruise Control (ACC) initiates sudden braking (deceleration > 4 m/s²) during light-to-dark transitions entering tunnels. The front radar and camera fusion module misinterprets the rapid luminance change as an obstacle. Occurs in 60% of tunnel entries at speeds above 100 km/h.',
    status: 'open',
    reportedDate: '2025-11-12',
    tags: ['adas', 'acc', 'safety', 'tunnel', 'phantom-braking']
  }
];

export const newDefectForDupeCheck = {
  id: 'DEF-4823',
  title: '[Navigation] System hangs during route recalculation after missing highway exit ramp',
  severity: 'High',
  component: 'Navigation / Route Engine',
  description: 'Navigation system becomes unresponsive for approximately 10 seconds when the vehicle passes the intended highway exit. The recalculation module appears to lock up when processing a missed-exit event at high speed. After the hang, it either crashes or reverts to the original route without adapting. Observed on BMW 3 Series G20 with iDrive 8.3.',
  environment: {
    vehicle_model: 'BMW 3 Series (G20) 2024',
    software_version: 'iDrive 8.3 (v23.07.1-prod)',
  },
  reportedBy: 'T. Weber',
  reportedDate: '2025-11-21',
  tags: ['navigation', 'hang', 'highway', 'route-recalculation', 'freeze']
};

// Pre-computed similarity scores for demo
export const similarityResults = [
  { defectId: 'DEF-3901', score: 0.94, type: 'exact-duplicate', sharedFactors: ['Navigation component', 'Route recalculation', 'Highway/motorway context', 'Freeze/hang behavior', 'iDrive 8.x platform'] },
  { defectId: 'DEF-4822', score: 0.91, type: 'exact-duplicate', sharedFactors: ['Navigation component', 'Route recalculation freeze', 'Highway context', 'High-speed trigger'] },
  { defectId: 'DEF-4512', score: 0.72, type: 'related', sharedFactors: ['Navigation component', 'High-speed scenario', 'Route display issue'] },
];

// --- Defect Comments (for RCA comment analysis) ---

export const defectComments = {
  'DEF-3901': [
    { author: 'M. Fischer', date: '2025-09-16', text: 'Confirmed on G20 as well. Same freeze behavior. Suspect the route graph traversal is blocking the render thread.' },
    { author: 'L. Braun', date: '2025-09-22', text: 'Profiled on bench — recalcRoute() runs synchronously on main thread. 9.2s avg at highway graph density. This was never async-wrapped during the iDrive 8 port.' },
    { author: 'K. Schneider', date: '2025-10-01', text: 'Checked git blame — module was copied verbatim from iDrive 7 codebase. No architectural review in the migration tracker.' },
  ],
  'DEF-4512': [
    { author: 'P. Richter', date: '2025-11-11', text: 'Map tile loader also runs on main thread. Same pattern as route recalculation — inherited from iDrive 7 without threading review.' },
    { author: 'T. Weber', date: '2025-11-14', text: 'Related to DEF-3901? Both are main-thread blocking issues in navigation module ported from previous platform.' },
  ],
  'DEF-4822': [
    { author: 'A. Hoffmann', date: '2025-11-21', text: 'Identical root cause to DEF-3901. The recalculation runs synchronously. At 120+ km/h the graph search space explodes because highway segments have fewer exit nodes — longer search time.' },
  ],
  'DEF-4823': [
    { author: 'T. Weber', date: '2025-11-22', text: 'This looks like the same issue as DEF-3901. Different vehicle model, same behavior. The migration from iDrive 7 skipped the async refactor.' },
  ]
};

export const commentAnalysisResult = {
  totalComments: 7,
  keyInsights: [
    { insight: 'Multiple engineers independently identified synchronous execution on main thread', mentions: 4, confidence: 'High' },
    { insight: 'Root cause traced to iDrive 7 → iDrive 8 migration with no architectural review', mentions: 3, confidence: 'High' },
    { insight: 'Engineers linked DEF-3901, DEF-4512, DEF-4822, DEF-4823 as same underlying issue', mentions: 2, confidence: 'Medium' },
  ],
  timelineFromComments: [
    { date: '2025-09-16', event: 'First engineer suspects render thread blocking' },
    { date: '2025-09-22', event: 'Bench profiling confirms: recalcRoute() = 9.2s synchronous on main thread' },
    { date: '2025-10-01', event: 'Git blame reveals verbatim copy from iDrive 7 — no migration review' },
    { date: '2025-11-11', event: 'Pattern recognized in second module (map tile loader)' },
    { date: '2025-11-22', event: 'Fourth defect filed — engineers converge on same root cause independently' },
  ]
};

// --- SECTION 3: Root Cause Analysis ---

export const rcaDefectCluster = {
  clusterId: 'CLUS-087',
  name: 'Navigation Route Engine Failures',
  defects: ['DEF-3901', 'DEF-4512', 'DEF-4822', 'DEF-4823'],
  commonFactors: ['Navigation module', 'High-speed conditions', 'Route processing'],
  timeRange: 'Sep 2025 - Nov 2025',
  trend: 'increasing'
};

export const fiveWhysAnalysis = [
  {
    level: 1,
    question: 'Why does the navigation system freeze during route recalculation?',
    answer: 'The route recalculation algorithm runs on the main UI thread, blocking all rendering and input handling for 8-12 seconds.'
  },
  {
    level: 2,
    question: 'Why does route recalculation run on the main UI thread?',
    answer: 'The route engine was designed as a synchronous module in iDrive 7. When ported to iDrive 8, the async wrapper was not implemented due to schedule pressure.'
  },
  {
    level: 3,
    question: 'Why was the async wrapper not implemented during the iDrive 8 migration?',
    answer: 'The navigation module was classified as "low-change" during migration planning. No architectural review was performed — it was a direct code port.'
  },
  {
    level: 4,
    question: 'Why was no architectural review performed for the navigation module?',
    answer: 'The migration review process only flagged modules with API signature changes. The route engine API remained unchanged, so it was auto-approved.'
  },
  {
    level: 5,
    question: 'Why does the review process only check API signatures and not runtime behavior?',
    answer: 'The migration review checklist was designed for backend services and does not include performance profiling or threading model validation for embedded HMI components.'
  }
];

export const fishboneCategories = {
  people: [
    'Migration team lacked embedded HMI expertise',
    'No performance engineer assigned to navigation module'
  ],
  process: [
    'Migration review checklist missing threading model validation',
    'No load testing for route recalculation under high-speed scenarios',
    '"Low-change" classification bypasses architectural review'
  ],
  tools: [
    'Static analysis tools do not detect main-thread blocking in Qt/QML',
    'CI pipeline has no performance regression benchmarks for HMI'
  ],
  environment: [
    'Lab testing uses simulated GPS at 60 km/h (real issue manifests at >120 km/h)',
    'Test routes do not include missed-exit scenarios'
  ],
  materials: [
    'iDrive 7 route engine assumes single-threaded execution model',
    'HERE Maps SDK v3 route API is synchronous by design'
  ],
  measurement: [
    'No telemetry for route recalculation latency in production',
    'Crash reports do not capture thread state at time of hang'
  ]
};

export const rootCauseResult = {
  id: 'ROOT-042',
  category: 'design',
  summary: 'Synchronous route recalculation engine blocking HMI main thread',
  description: 'The iDrive 7 navigation route engine executes route recalculation synchronously on the main HMI thread. During the iDrive 8 migration, this module was ported without architectural changes due to its "low-change" classification. At highway speeds (>120 km/h), missed-exit recalculations involve significantly more graph traversal than urban rerouting, causing 8-12 second UI freezes. The absence of threading model validation in the migration review process allowed this architectural debt to reach production.',
  confidence: 0.92,
  affectedDefects: ['DEF-3901', 'DEF-4512', 'DEF-4822', 'DEF-4823'],
  preventiveMeasures: [
    'Move route recalculation to dedicated worker thread with async callback to UI',
    'Add threading model validation step to platform migration review checklist',
    'Implement route recalculation latency telemetry (P50/P95/P99) in production',
    'Add high-speed missed-exit scenarios to navigation integration test suite',
    'Set performance budget: route recalculation must complete within 2 seconds'
  ],
  relatedPatterns: [
    { pattern: 'Synchronous-to-async migration debt', occurrences: 3, modules: ['Navigation', 'Voice Control', 'Media Player'] },
    { pattern: 'Missing performance validation in platform migration', occurrences: 5, modules: ['HMI', 'Connectivity', 'ADAS Visualization'] }
  ]
};
