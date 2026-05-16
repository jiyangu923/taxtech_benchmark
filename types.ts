export type Role = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  email_reminders_enabled?: boolean;
  last_reminder_sent_at?: string | null;
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
  is_current?: boolean;
  survey_version?: number;
  
  // Section 1: Context & Respondent Info
  companyName?: string;
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
  taxTechDecisionOwner?: string;
  buildVsBuyExperience?: string[];

  // Section 4
  taxTechFTEsRange?: string;
  taxTechOutsourcedResourcesFTEsRange?: string;
  annualTaxTechBudgetRange?: string;
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
  vatSalesTaxAutomationRange?: string;
  eInvoicingAutomationRange?: string;
  customsDutiesAutomationRange?: string;
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

export type FeedbackType = 'bug' | 'feature' | 'general';
export type FeedbackStatus = 'new' | 'triaged' | 'resolved' | 'archived';

export interface Feedback {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  type: FeedbackType;
  message: string;
  page_path: string | null;
  user_agent: string | null;
  status: FeedbackStatus;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Payload for the public feedback widget — what the user submits. */
export interface FeedbackSubmission {
  type: FeedbackType;
  message: string;
  user_email?: string;
  user_name?: string;
  page_path?: string;
  user_agent?: string;
}

export type ReleaseLetterStatus = 'draft' | 'sent';

export interface ReleaseLetter {
  id: string;
  title: string;
  week_of: string;          // YYYY-MM-DD
  body_markdown: string;
  status: ReleaseLetterStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  sent_count: number;
}

/** Payload to create or update a release letter from the admin form. */
export interface ReleaseLetterDraft {
  title: string;
  week_of: string;
  body_markdown: string;
}

export type CommunityMemberStatus = 'pending' | 'confirmed' | 'declined';

export interface CommunityMember {
  id: string;
  email: string;
  name: string;
  role: string | null;
  company: string | null;
  company_logo_url: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  status: CommunityMemberStatus;
  confirmed_at: string | null;
  declined_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  invited_at?: string | null;
  confirm_token_expires_at?: string | null;
}

/** Payload the admin form sends when creating or editing a member. */
export interface CommunityMemberDraft {
  email: string;
  name: string;
  role?: string | null;
  company?: string | null;
  company_logo_url?: string | null;
  linkedin_url?: string | null;
  photo_url?: string | null;
}

/**
 * Subset of a member that the member themselves can edit on the
 * public /confirm-member page. The server validates a token before
 * accepting any of these fields. `name` is required; all others optional.
 */
export interface CommunityMemberSelfDraft {
  name: string;
  role?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
  photo_url?: string | null;
}

/**
 * Returned by /api/community/lookup when the member opens their invite
 * link. Just enough info to pre-fill the form — no token or other
 * sensitive fields.
 */
export interface CommunityMemberInvitePreview {
  email: string;
  name: string;
  role: string | null;
  company: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
}