# Agent 2: React Frontend Specialist Briefing

## Mission
Fix all frontend TypeScript errors and build issues to enable visualization dashboard compilation.

## Target Files
1. `/workspaces/agentic-qe-cf/frontend/src/components/MindMap/MindMap.tsx`
2. `/workspaces/agentic-qe-cf/frontend/src/components/MetricsPanel/RadarChart.tsx`

## Error Summary
- **5 TypeScript errors total**
- **1 LOW severity** (unused import)
- **4 MEDIUM-HIGH severity** (type mismatches, missing declarations)

## Detailed Error Analysis

### Error 1: Unused Import (RadarChart.tsx:13)
```
error TS6133: 'QualityMetrics' is declared but its value is never read
```
**Severity:** LOW
**Fix:** Remove import or use the type

### Error 2: Missing Type Declarations (MindMap.tsx:3)
```
error TS7016: Could not find a declaration file for module 'cytoscape-cose-bilkent'
```
**Severity:** MEDIUM
**Fix Options:**
1. `npm install --save-dev @types/cytoscape-cose-bilkent` (if exists)
2. Create custom declaration: `frontend/src/types/cytoscape-cose-bilkent.d.ts`

### Error 3: Type Mismatch (MindMap.tsx:90)
```
error TS2322: Type 'number' is not assignable to type 'PropertyValue<NodeSingular, string> | undefined'
```
**Severity:** MEDIUM
**Fix:** Cast number to string or use Cytoscape property syntax

### Errors 4-5: Unknown Property (MindMap.tsx:130, 199)
```
error TS2353: Object literal may only specify known properties, and 'animate' does not exist in type 'BaseLayoutOptions'
```
**Severity:** MEDIUM-HIGH
**Fix:**
1. Check Cytoscape.js layout options documentation
2. Use layout-specific options type
3. Or remove `animate` if not supported

## Success Criteria
1. Run `cd /workspaces/agentic-qe-cf/frontend && npm run build` - must pass
2. Zero TypeScript errors in frontend
3. Vite build completes successfully
4. Bundle size < 500KB

## Testing Commands
```bash
cd /workspaces/agentic-qe-cf/frontend
npm run build 2>&1 | tee ../docs/phase3/fixes/frontend-react/BUILD-RESULT.txt
ls -lh dist/assets/*.js | tee -a ../docs/phase3/fixes/frontend-react/BUILD-RESULT.txt
```

## Expected Deliverables
1. **Fixed MindMap.tsx** - All type errors resolved
2. **Fixed RadarChart.tsx** - Unused import removed
3. **Type declarations** (if created)
4. **BUILD-RESULT.txt** - Proof of successful build
5. **PROGRESS.md** - Document changes made

## Time Estimate
1-2 hours

## Dependencies
NONE - Start immediately (independent of backend)

## Notes
- Frontend and backend can work in parallel
- Your success doesn't block other agents
- Focus on getting clean build first, optimization later
