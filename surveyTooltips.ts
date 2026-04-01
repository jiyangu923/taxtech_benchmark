/**
 * Tooltip explanations for each survey question.
 * Used by the Survey UI for hover hints, and available as context for AI analysis.
 *
 * Keys match the field names in the Submission type (types.ts).
 * Section labels are included for organizational reference.
 */

const SURVEY_TOOLTIPS: Record<string, string> = {
  // Section 1: Benchmarking Context
  companyProfile:
    'Helps us segment benchmarks by company type — public companies face different tax reporting requirements than PE-backed or pre-IPO firms.',
  participationGoal:
    'Helps us tailor your benchmark report to what matters most to you.',
  respondentRole:
    'Tax professionals and tax technologists see the same data differently — this helps us frame insights for your perspective.',

  // Section 2: Organizational Profile
  industry:
    'Different industries have very different indirect tax complexity — e-commerce vs. SaaS vs. manufacturing are worlds apart.',
  revenueRange:
    'Larger organizations typically have more complex tax operations. This is the #1 driver of peer grouping.',
  jurisdictionsCovered:
    'A company operating in 5 countries faces fundamentally different challenges than one in 150. Essential for meaningful peer comparison.',
  organizationScope:
    'Tells us whether your team owns the full tax lifecycle or just a slice — directly impacts how we interpret your FTE and automation numbers.',

  // Section 3: Operating Model & Governance
  taxTechLocation:
    'Where tax tech sits in the org chart (Tax, IT, Product) shapes budget, hiring, and strategic influence.',
  centralizationModel:
    'Centralized teams operate differently from distributed ones — affects speed, consistency, and cost.',
  taxOutsourcingExtent:
    'The in-house vs. outsourced mix reveals how teams balance control, cost, and scalability.',
  taxTechDecisionOwner:
    'One of the most asked questions in benchmarking — who controls the budget and vendor choices for tax tech?',
  buildVsBuyExperience:
    'Learning from what peers tried and failed at is some of the most valuable benchmarking data.',

  // Section 4: Resource Benchmarking
  taxTechFTEsRange:
    'Core staffing metric — how many people are dedicated to tax technology in-house.',
  taxTechOutsourcedResourcesFTEsRange:
    'The ratio of internal to outsourced tech resources reveals your operating model\'s reliance on external talent.',
  annualTaxTechBudgetRange:
    'FTE counts alone don\'t tell the full story. A team of 5 on Vertex at $2M/yr looks completely different from 5 on a custom stack.',
  taxBusinessFTEsRange:
    'The size of the tax business team relative to tech shows how work is distributed across your function.',
  taxBusinessOutsourcingFTEsRange:
    'High outsourcing here often indicates compliance-heavy operations or scale challenges.',

  // Section 5: Talent & Skill Composition
  taxTechSkillMixFrontendPercent:
    'Shows how specialized your tech team is — a team with dedicated DevOps is more mature than one without.',
  taxTechSkillMixBackendPercent:
    'Shows how specialized your tech team is — a team with dedicated DevOps is more mature than one without.',
  taxTechSkillMixDataEngineeringPercent:
    'Shows how specialized your tech team is — a team with dedicated DevOps is more mature than one without.',
  taxTechSkillMixDevOpsPercent:
    'Shows how specialized your tech team is — a team with dedicated DevOps is more mature than one without.',
  taxTechSkillMixOtherPercent:
    'Shows how specialized your tech team is — a team with dedicated DevOps is more mature than one without.',
  planningSpecialistsPercent:
    'Reveals whether your tax team is compliance-heavy or balanced across planning, audit, and reporting.',
  complianceSpecialistsPercent:
    'Reveals whether your tax team is compliance-heavy or balanced across planning, audit, and reporting.',
  auditSpecialistsPercent:
    'Reveals whether your tax team is compliance-heavy or balanced across planning, audit, and reporting.',
  provisionSpecialistsPercent:
    'Reveals whether your tax team is compliance-heavy or balanced across planning, audit, and reporting.',
  otherSpecialistsPercent:
    'Reveals whether your tax team is compliance-heavy or balanced across planning, audit, and reporting.',

  // Section 6: Process Maturity & Automation
  taxCalculationAutomationRange:
    'How much of your tax determination is automated — the foundation of tax tech maturity.',
  taxPaymentAutomationRange:
    'Payment automation reduces errors and late-payment penalties. Low automation here is a common pain point.',
  vatSalesTaxAutomationRange:
    'VAT/sales tax compliance is where most indirect tax teams focus their automation efforts first.',
  eInvoicingAutomationRange:
    'E-invoicing mandates are spreading globally — your automation level here predicts readiness for upcoming regulations.',
  withholdingTaxAutomationRange:
    'Often overlooked, withholding tax automation prevents costly over- or under-withholding across jurisdictions.',
  customsDutiesAutomationRange:
    'Customs automation is an emerging area — few teams have mature solutions, making this a potential differentiator.',
  regulatoryChangeResponseTime:
    'How fast you can implement a regulatory change is a key indicator of organizational agility.',

  // Section 7: Data & Filing Ecosystem
  taxDataArchitecture:
    'Your data architecture determines how quickly you can adapt to new requirements and generate insights.',
  dataHostingPlatform:
    'The platform choice affects cost, scalability, and integration with your broader data ecosystem.',
  annualTaxFilingsRange:
    'Higher filing volumes require more automation — this helps calibrate your automation metrics in context.',
  dataConfidence:
    'Low data confidence often signals deeper issues with source systems, reconciliation, or data governance.',

  // Section 8: Technical Architecture
  architecturePattern:
    'Monolith vs. microservices reveals the maturity and flexibility of your tax tech stack.',
  dataFlow:
    'Real-time data flows enable faster decisions; batch processing may indicate legacy constraints.',
  cloudProvider:
    'Cloud choice affects available services, cost, and integration with enterprise infrastructure.',
  primaryProgrammingLanguages:
    'The programming language reveals team hiring profile and technology generation.',

  // Section 9: Regulatory Agility
  productRegulationEnablementCycle:
    'The speed of implementing regulatory changes end-to-end is one of the strongest indicators of operational maturity.',
  financialCloseTotalDays:
    'Shorter close cycles correlate with higher automation and better data quality.',
  financialCloseCompletionDay:
    'Which day of the close cycle tax completes shows how dependent the process is on upstream data.',
  aiAdopted:
    'AI adoption in tax is accelerating — even a simple yes/no helps track industry momentum.',
  genAIAdoptionStage:
    'Knowing whether peers are experimenting or in production helps calibrate your own AI roadmap.',
};

export default SURVEY_TOOLTIPS;
