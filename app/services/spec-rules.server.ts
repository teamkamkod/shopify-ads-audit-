import specConfig from "../../config/openai-commerce-spec.json";

export type Severity = "blocking" | "recommended" | "ads";

export interface SpecField {
  id: string;
  openaiField: string;
  label: string;
  severity: Severity;
  rule: string;
  message: string;
  note?: string;
  maxLength?: number;
  minDigits?: number;
  maxDigits?: number;
  expectedOptions?: string[];
}

export interface SpecConfig {
  specVersion: string;
  lastReviewed: string;
  source: string;
  fields: SpecField[];
}

export function loadSpecRules(): SpecConfig {
  return specConfig as SpecConfig;
}
