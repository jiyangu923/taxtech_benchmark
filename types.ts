export type Role = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// Internal record for auth simulation
export interface UserRecord extends User {
  password?: string;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface Submission {
  id: string;
  userId: string;
  userName: string;
  status: SubmissionStatus;
  submittedAt: string;
  
  // Section 1: Context & Respondent Info
  companyProfile: string[];
  participationGoal: string[];
  respondentRole: 'tax_professionals' | 'tax_technology' | '';
  ownedTaxFunctions: string[];
  ownedTaxFunctionsOther?: string;
  organizationScope: string;

  // Section 2
  industry?: string;
  revenueRange: string;

  // Section 3
  taxTechLocation?: string;
  centralizationModel?: string;
  taxTechApproach?: string;
  taxOutsourcingExtent?: string;

  // Section 4
  taxTechFTEsRange?: string;
  taxTechOutsourcedResourcesFTEsRange?: string;
  dataHostingPlatform?: string;
  dataHostingPlatformOther?: string;
  taxTechSkillMixFrontendPercent?: number;
  taxTechSkillMixBackendPercent?: number;
  taxTechSkillMixDataEngineeringPercent?: number;
  taxTechSkillMixDevOpsPercent?: number;
  taxTechSkillMixOtherPercent?: number;

  // Section 5
  taxBusinessFTEsRange?: string;
  taxBusinessOutsourcingFTEsRange?: string;
  planningSpecialistsPercent?: number;
  complianceSpecialistsPercent?: number;
  auditSpecialistsPercent?: number;
  provisionSpecialistsPercent?: number;
  otherSpecialistsPercent?: number;

  // Section 6
  taxCalculationAutomationRange?: string;
  taxPaymentAutomationRange?: string;
  withholdingTaxAutomationRange?: string;
  complianceAutomationCoverageRange?: string;
  regulatoryChangeResponseTime?: string;
  dataConfidence?: string;

  // Section 7
  annualTaxFilingsRange?: string;
  jurisdictionsCovered?: number;
  taxDataArchitecture?: string;

  // Section 8
  architecturePattern?: string;
  dataFlow?: string;
  primaryProgrammingLanguages?: string;
  cloudProvider?: string;
  cicdTools?: string;

  // Section 9
  productRegulationEnablementCycle?: string;
  incidentResponseTime?: string;
  p0IncidentsPerQuarter?: string;

  // Section 10
  financialCloseTotalDays?: number;
  financialCloseCompletionDay?: number;

  // Section 11
  aiAdopted: boolean;
  genAIAdoptionStage?: string;
  aiUseCases?: string;
  additionalNotes?: string;
}

export interface Option {
  value: string;
  label: string;
}

export interface SectionDef {
  id: number;
  title: string;
  description: string;
}