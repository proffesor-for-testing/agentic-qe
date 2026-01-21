/**
 * Coverage Analyze Sublinear Handler
 * Wrapper handler for the sublinear coverage analysis function
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import {
  coverageAnalyzeSublinear,
  CoverageAnalyzeSublinearParams
} from './coverageAnalyzeSublinear.js';

export class CoverageAnalyzeSublinearHandler extends BaseHandler {
  async handle(args: CoverageAnalyzeSublinearParams): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();

      this.log('info', 'Starting sublinear coverage analysis', { requestId, args });

      // Execute the analysis
      const result = await coverageAnalyzeSublinear(args);

      this.log('info', 'Sublinear coverage analysis completed', {
        requestId,
        overallCoverage: result.overallCoverage,
        algorithm: result.sublinearMetrics.algorithmUsed
      });

      return this.createSuccessResponse(result, requestId);
    });
  }
}
