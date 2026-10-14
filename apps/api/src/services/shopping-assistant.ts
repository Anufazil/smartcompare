import type { CompareRequest, UserLocation } from '@smartcompare/shared';
// Future boundary only: core comparisons have no LLM dependency.
export interface ShoppingAssistantService {
  interpret(
    message: string,
    location: UserLocation,
  ): Promise<CompareRequest & { maxEtaMinutes?: number }>;
}
