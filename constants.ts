import { Option, SectionDef } from './types';

export const SECTIONS: SectionDef[] = [
  { id: 1, title: 'Benchmarking Context', description: 'Survey goals and company profile' },
  { id: 2, title: 'Organizational Profile', description: 'Industry, revenue, and organizational scope' },
  { id: 3, title: 'Operating Model & Governance', description: 'Internal structure and technology approach' },
  { id: 4, title: 'Resource Benchmarking', description: 'Headcount and outsourcing metrics' },
  { id: 5, title: 'Talent & Skill Composition', description: 'Specialization and technical skill mix' },
  { id: 6, title: 'Process Maturity & Automation', description: 'Core automation and responsiveness KPIs' },
  { id: 7, title: 'Data & Filing Ecosystem', description: 'Compliance volume and data integrity' },
  { id: 8, title: 'Technical Architecture', description: 'Underlying tech stack and engineering patterns' },
  { id: 9, title: 'Performance & Innovation', description: 'Operational efficiency and AI readiness' },
];

export const OPTS_COMPANY_PROFILE: Option[] = [
  { value: 'public', label: 'Public company' },
  { value: 'private_pe', label: 'Private / PE-backed' },
  { value: 'pre_ipo', label: 'Pre-IPO' },
  { value: 'multinational', label: 'Multinational' },
  { value: 'domestic', label: 'Primarily domestic' },
];

export const OPTS_PARTICIPATION_GOAL: Option[] = [
  { value: 'benchmark', label: 'Benchmark against peers' },
  { value: 'budget_justification', label: 'Justify budget or headcount' },
  { value: 'build_vs_buy', label: 'Evaluate build vs buy decisions' },
  { value: 'maturity_assessment', label: 'Understand tax technology maturity' },
  { value: 'transformation_support', label: 'Support transformation initiatives' },
];

export const OPTS_RESPONDENT_ROLE: Option[] = [
  { value: 'tax_professionals', label: 'Tax Professionals' },
  { value: 'tax_technology', label: 'Tax Technology' },
];

export const OPTS_TAX_FUNCTIONS: Option[] = [
  { value: 'indirect_tax', label: 'Indirect tax (Sales tax, VAT, GST)' },
  { value: 'direct_tax', label: 'Direct tax (Corporate income tax)' },
  { value: 'transfer_pricing', label: 'Transfer pricing' },
  { value: 'withholding_taxes', label: 'Withholding taxes' },
  { value: 'reporting_provision', label: 'Tax reporting & provision' },
  { value: 'audits_controversy', label: 'Tax audits / controversy' },
  { value: 'planning_structuring', label: 'Tax planning / structuring' },
  { value: 'none', label: 'None (fully outsourced)' },
  { value: 'other', label: 'Other (please specify)' },
];

export const OPTS_ORG_SCOPE: Option[] = [
  { value: 'narrow', label: 'Narrow (1–2 tax functions, limited responsibility)' },
  { value: 'moderate', label: 'Moderate (multiple tax functions, partial ownership)' },
  { value: 'broad', label: 'Broad (most or all tax functions owned in-house)' },
];

export const OPTS_OUTSOURCING_EXTENT: Option[] = [
  { value: 'mostly_in_house', label: 'Mostly in-house' },
  { value: 'hybrid', label: 'Hybrid (in-house + external providers)' },
  { value: 'mostly_outsourced', label: 'Mostly outsourced' },
  { value: 'fully_outsourced', label: 'Fully outsourced' },
];

export const OPTS_TECH_APPROACH: Option[] = [
  { value: 'vendor', label: 'Primarily vendor solutions (buy)' },
  { value: 'in_house', label: 'Primarily in-house built systems (build)' },
  { value: 'hybrid', label: 'Hybrid (vendor solutions with internal extensions)' },
  { value: 'minimal', label: 'Minimal dedicated tax technology' },
];

export const OPTS_INDUSTRY: Option[] = [
  { value: 'technology', label: 'Technology & Software' },
  { value: 'healthcare_life_sciences', label: 'Healthcare & Life Sciences' },
  { value: 'financial_services', label: 'Financial Services & Fintech' },
  { value: 'consumer_goods_retail', label: 'Retail & E-commerce' },
  { value: 'industrial_manufacturing', label: 'Manufacturing & Industrials' },
  { value: 'energy_utilities', label: 'Energy & Utilities' },
  { value: 'telecommunications_media', label: 'Media & Telecommunications' },
  { value: 'transportation_logistics', label: 'Logistics & Transportation' },
  { value: 'other', label: 'Other / Specialized' },
];

export const OPTS_TAX_TECH_ORG_LOCATION: Option[] = [
  { value: 'tax_finance', label: 'Tax (Finance) — Tax-owned Engineering' },
  { value: 'finance_systems', label: 'Finance Systems — CFO org business systems' },
  { value: 'enterprise_it', label: 'Enterprise IT — shared enterprise platforms' },
  { value: 'product_engineering', label: 'Product Engineering — embedded in money flows' },
  { value: 'hybrid_model', label: 'Hybrid / Co-ownership model' },
];

export const OPTS_CENTRALIZATION: Option[] = [
  { value: 'centralized', label: 'Centralized Hub' },
  { value: 'distributed', label: 'Distributed / Regional' },
  { value: 'hybrid', label: 'Hybrid CoE Model' },
];

export const OPTS_REVENUE: Option[] = [
  { value: 'under_100m', label: 'Under $100M' },
  { value: '100m_1b', label: '$100M - $1B' },
  { value: '1b_10b', label: '$1B - $10B' },
  { value: '10b_50b', label: '$10B - $50B' },
  { value: 'over_50b', label: 'Over $50B' },
];

export const OPTS_FTE_TECH: Option[] = [
  { value: 'zero', label: '0 (None)' },
  { value: '1_5', label: '1 - 5' },
  { value: '6_15', label: '6 - 15' },
  { value: '16_30', label: '16 - 30' },
  { value: '31_100', label: '31 - 100' },
  { value: 'over_100', label: '100+' },
];

export const OPTS_FTE_BUSINESS: Option[] = [
  { value: 'under_10', label: 'Under 10' },
  { value: '10_25', label: '10 - 25' },
  { value: '26_50', label: '26 - 50' },
  { value: '51_150', label: '51 - 150' },
  { value: 'over_150', label: '150+' },
];

export const OPTS_DATA_HOSTING: Option[] = [
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'databricks', label: 'Databricks' },
  { value: 'bigquery', label: 'Google BigQuery' },
  { value: 'redshift', label: 'Amazon Redshift' },
  { value: 'no', label: 'No dedicated data platform' },
  { value: 'other', label: 'Other platform' },
];

export const OPTS_TAX_DATA_ARCH: Option[] = [
  { value: 'data_lake', label: 'Centralized Tax Data Lake' },
  { value: 'data_warehouse', label: 'Tax-specific Data Warehouse' },
  { value: 'shared_finance_platform', label: 'Shared Finance Data Platform' },
  { value: 'erp_only', label: 'ERP Only (No dedicated layer)' },
  { value: 'distributed', label: 'Distributed across disparate systems' },
];

export const OPTS_AUTOMATION: Option[] = [
  { value: '99_plus', label: '99%+' },
  { value: '90_99', label: '90 - 99%' },
  { value: '70_90', label: '70 - 90%' },
  { value: '40_70', label: '40 - 70%' },
  { value: 'under_40', label: '< 40%' },
];

export const OPTS_REGULATORY_RESPONSE: Option[] = [
  { value: 'under_1_month', label: 'Less than 1 month' },
  { value: '1_3_months', label: '1–3 months' },
  { value: '3_6_months', label: '3–6 months' },
  { value: 'over_6_months', label: 'More than 6 months' },
];

export const OPTS_DATA_CONFIDENCE: Option[] = [
  { value: 'very_confident', label: 'Very Confident' },
  { value: 'somewhat_confident', label: 'Somewhat Confident' },
  { value: 'neutral', label: 'Neutral / Average' },
  { value: 'low_confidence', label: 'Low Confidence' },
];

export const OPTS_FILINGS: Option[] = [
  { value: 'under_100', label: 'Under 100' },
  { value: '100_1k', label: '100 - 1,000' },
  { value: '1k_5k', label: '1,000 - 5,000' },
  { value: '5k_20k', label: '5,000 - 20,000' },
  { value: 'over_20k', label: 'Over 20,000' },
];

export const OPTS_ARCH_PATTERN: Option[] = [
  { value: 'monolith', label: 'Monolith (Legacy)' },
  { value: 'microservices', label: 'Microservices (Modern)' },
  { value: 'serverless', label: 'Serverless / Cloud Native' },
  { value: 'hybrid', label: 'Hybrid' },
];

export const OPTS_DATA_FLOW: Option[] = [
  { value: 'batch_etl', label: 'Batch ETL' },
  { value: 'event_driven', label: 'Event-Driven (Real-time)' },
  { value: 'real_time_streaming', label: 'Real-time Streaming' },
  { value: 'manual', label: 'Manual Transfers' },
];

export const OPTS_LANGUAGES: Option[] = [
  { value: 'python', label: 'Python (Data/ML)' },
  { value: 'java_kotlin', label: 'Java / Kotlin' },
  { value: 'go', label: 'Go' },
  { value: 'ts_js', label: 'TypeScript / Node.js' },
  { value: 'csharp', label: 'C# / .NET' },
  { value: 'other', label: 'Other' },
];

export const OPTS_CLOUD: Option[] = [
  { value: 'aws', label: 'AWS' },
  { value: 'azure', label: 'Azure' },
  { value: 'gcp', label: 'GCP' },
  { value: 'multi_cloud', label: 'Multi-Cloud' },
  { value: 'on_prem', label: 'On-Premise' },
];

export const OPTS_CICD: Option[] = [
  { value: 'github_actions', label: 'GitHub Actions' },
  { value: 'gitlab_ci', label: 'GitLab CI' },
  { value: 'jenkins', label: 'Jenkins' },
  { value: 'azure_devops', label: 'Azure DevOps' },
  { value: 'other', label: 'Other' },
];

export const OPTS_GENAI_STAGE: Option[] = [
  { value: 'exploration', label: 'Ideation & Exploration' },
  { value: 'poc', label: 'Proof of Concept (PoC)' },
  { value: 'production', label: 'Production Deployment' },
  { value: 'enterprise_wide', label: 'Enterprise-Wide Adoption' },
];