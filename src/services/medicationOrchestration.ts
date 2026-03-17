import { MedicationInfo } from './medicationOCR';
import { GroundedMedicationData } from './medicationGrounding';
import { formatMedicationResponse } from '../utils/medicationSafety';

/**
 * Orchestrates the generation of a conversational response for medication safety.
 * Combines real-time OCR with verified database data.
 * @param ocrInfo Data from Gradient AI vision
 * @param groundedData Data from Gradient AI tool orchestration (optional)
 * @returns A safe, conversational response string
 */
export function generateGroundedResponse(
  ocrInfo: MedicationInfo,
  groundedData?: GroundedMedicationData
): string {
  let responseText: string;

  if (groundedData) {
    responseText = `This is ${groundedData.verifiedName} ${groundedData.verifiedStrength}. According to the label and ${groundedData.source}, the instructions are: ${groundedData.officialDosageInstructions}`;
  } else {
    responseText = `This is ${ocrInfo.name} ${ocrInfo.strength}. External verification could not be completed. According to the label: ${ocrInfo.dosage}`;
  }

  return formatMedicationResponse(responseText, ocrInfo);
}
