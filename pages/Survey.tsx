import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Save, AlertCircle, SkipForward, CheckCircle2, Calculator, CheckSquare, Square } from 'lucide-react';
import { mockStore } from '../services/mockStore';
import { Submission } from '../types';
import * as C from '../constants';

const Survey: React.FC = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(1);
  const [formData, setFormData] = useState<Partial<Submission>>({
    companyProfile: [],
    participationGoal: [],
    respondentRole: '',
    ownedTaxFunctions: [],
    organizationScope: '',
    revenueRange: '',
    aiAdopted: false,
    taxTechSkillMixFrontendPercent: 0,
    taxTechSkillMixBackendPercent: 0,
    taxTechSkillMixDataEngineeringPercent: 0,
    taxTechSkillMixDevOpsPercent: 0,
    taxTechSkillMixOtherPercent: 0,
    planningSpecialistsPercent: 0,
    complianceSpecialistsPercent: 0,
    auditSpecialistsPercent: 0,
    provisionSpecialistsPercent: 0,
    otherSpecialistsPercent: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof Submission, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const progress = Math.round((activeSection / C.SECTIONS.length) * 100);

  const getGroupSum = (fields: (keyof Submission)[]): number => {
    return fields.reduce((acc, f) => acc + ((formData[f] as number) || 0), 0);
  };

  const validatePercentages = (section: number): string | null => {
    if (section !== 5) return null;
    
    const techSum = getGroupSum([
        'taxTechSkillMixFrontendPercent', 'taxTechSkillMixBackendPercent',
        'taxTechSkillMixDataEngineeringPercent', 'taxTechSkillMixDevOpsPercent',
        'taxTechSkillMixOtherPercent'
    ]);

    const bizSum = getGroupSum([
        'planningSpecialistsPercent', 'complianceSpecialistsPercent',
        'auditSpecialistsPercent', 'provisionSpecialistsPercent',
        'otherSpecialistsPercent'
    ]);

    if (techSum > 0 && Math.abs(techSum - 100) > 0.1) {
      return `Tax Technology Skill Mix must sum to exactly 100%. Current: ${techSum}%`;
    }
    if (bizSum > 0 && Math.abs(bizSum - 100) > 0.1) {
      return `Tax Business Specialization must sum to exactly 100%. Current: ${bizSum}%`;
    }
    return null;
  };

  const handleNext = () => {
    setError(null);
    if (activeSection === 1 && !formData.companyProfile?.length) {
      setError('Please select a company profile.');
      return;
    }
    if (activeSection === 2 && !formData.revenueRange) {
      setError('Please select a revenue range.');
      return;
    }

    const pctError = validatePercentages(activeSection);
    if (pctError) {
      setError(pctError);
      return;
    }

    if (activeSection === C.SECTIONS.length) {
      handleSubmit();
    } else {
      setActiveSection(activeSection + 1);
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = () => {
    try {
      mockStore.createSubmission(formData as any);
      alert('Survey submitted! Awaiting review.');
      navigate('/report');
    } catch (e) {
      setError('Failed to submit survey.');
    }
  };

  const SumIndicator = ({ fields, label }: { fields: (keyof Submission)[], label: string }) => {
    const total = getGroupSum(fields);
    const isExact = Math.abs(total - 100) < 0.1;
    const isOver = total > 100.1;
    
    return (
      <div className="bg-gray-50 rounded-2xl p-4 mb-4 border border-gray-100">
        <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{label} Validation</span>
            <span className={`text-sm font-black ${isExact ? 'text-green-600' : isOver ? 'text-red-600' : 'text-orange-500'}`}>
                {total}% / 100%
            </span>
        </div>
        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-300 ${isExact ? 'bg-green-500' : isOver ? 'bg-red-500' : 'bg-orange-400'}`} style={{width: `${Math.min(total, 100)}%`}} />
        </div>
      </div>
    );
  };

  const renderInput = (label: string, field: keyof Submission, type: 'text' | 'number' = 'text') => (
    <div className="mb-4">
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">{label}</label>
      <input
        type={type}
        className="w-full rounded-xl border-gray-200 p-3 border font-bold text-sm focus:ring-primary focus:border-primary outline-none"
        value={formData[field] || ''}
        onChange={(e) => handleChange(field, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
      />
    </div>
  );

  const renderSelect = (label: string, field: keyof Submission, options: { value: string; label: string }[]) => (
    <div className="mb-4">
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">{label}</label>
      <select
        className="w-full rounded-xl border-gray-200 p-3 border font-bold text-sm bg-white cursor-pointer outline-none"
        value={formData[field] || ''}
        onChange={(e) => handleChange(field, e.target.value)}
      >
        <option value="">Select Option...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const renderRadio = (label: string, field: keyof Submission, options: { value: string; label: string }[]) => (
    <div className="mb-6">
      <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-4">{label}</label>
      <div className="space-y-3">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => handleChange(field, o.value)}
            className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3 ${formData[field] === o.value ? 'bg-indigo-50 border-primary text-primary' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            <div className={`h-4 w-4 rounded-full border-2 ${formData[field] === o.value ? 'border-primary bg-primary' : 'border-gray-300'}`} />
            <span className="text-sm font-bold">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const currentSection = C.SECTIONS[activeSection - 1];

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 bg-gray-50 min-h-screen">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Benchmark Survey</h1>
        <p className="text-gray-500 text-sm mt-1">Step {activeSection} of {C.SECTIONS.length}</p>
        <div className="mt-6 w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full transition-all duration-500" style={{width: `${progress}%`}} />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 font-bold text-sm animate-shake">
            <AlertCircle className="h-5 w-5" /> {error}
        </div>
      )}

      <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 min-h-[400px]">
        <h2 className="text-2xl font-black text-gray-900 mb-2">{currentSection.title}</h2>
        <p className="text-gray-400 text-sm mb-8 pb-6 border-b border-gray-50">{currentSection.description}</p>

        {activeSection === 1 && (
            <div className="space-y-6">
                {renderRadio("Company Profile", "companyProfile", C.OPTS_COMPANY_PROFILE)}
                {renderRadio("Primary Goal", "participationGoal", C.OPTS_PARTICIPATION_GOAL)}
            </div>
        )}

        {activeSection === 2 && (
            <div className="space-y-6">
                {renderSelect("Industry", "industry", C.OPTS_INDUSTRY)}
                {renderSelect("Revenue Range", "revenueRange", C.OPTS_REVENUE)}
                {renderRadio("Org Scope", "organizationScope", C.OPTS_ORG_SCOPE)}
            </div>
        )}

        {activeSection === 3 && (
            <div className="space-y-6">
                {renderSelect("Tech Location", "taxTechLocation", C.OPTS_TAX_TECH_ORG_LOCATION)}
                {renderSelect("Operating Model", "centralizationModel", C.OPTS_CENTRALIZATION)}
                {renderRadio("Outsourcing Strategy", "taxOutsourcingExtent", C.OPTS_OUTSOURCING_EXTENT)}
            </div>
        )}

        {activeSection === 4 && (
            <div className="space-y-8">
                <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                    <h3 className="text-xs font-black text-indigo-900 uppercase tracking-widest mb-4">Technology Resources</h3>
                    {renderSelect("Internal Tech FTEs", "taxTechFTEsRange", C.OPTS_FTE_TECH)}
                    {renderSelect("External Tech Support", "taxTechOutsourcedResourcesFTEsRange", C.OPTS_FTE_TECH)}
                </div>
                <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-4">Business Resources</h3>
                    {renderSelect("Internal Business FTEs", "taxBusinessFTEsRange", C.OPTS_FTE_BUSINESS)}
                    {renderSelect("Business BPO Support", "taxBusinessOutsourcingFTEsRange", C.OPTS_FTE_BUSINESS)}
                </div>
            </div>
        )}

        {activeSection === 5 && (
            <div className="space-y-8">
                <div>
                    <SumIndicator label="Tech Skill Mix" fields={['taxTechSkillMixFrontendPercent', 'taxTechSkillMixBackendPercent', 'taxTechSkillMixDataEngineeringPercent', 'taxTechSkillMixDevOpsPercent', 'taxTechSkillMixOtherPercent']} />
                    <div className="grid grid-cols-2 gap-4">
                        {renderInput("Frontend %", "taxTechSkillMixFrontendPercent", "number")}
                        {renderInput("Backend %", "taxTechSkillMixBackendPercent", "number")}
                        {renderInput("Data %", "taxTechSkillMixDataEngineeringPercent", "number")}
                        {renderInput("DevOps %", "taxTechSkillMixDevOpsPercent", "number")}
                    </div>
                </div>
                <div>
                    <SumIndicator label="Business Specialization" fields={['planningSpecialistsPercent', 'complianceSpecialistsPercent', 'auditSpecialistsPercent', 'provisionSpecialistsPercent', 'otherSpecialistsPercent']} />
                    <div className="grid grid-cols-2 gap-4">
                        {renderInput("Strategy %", "planningSpecialistsPercent", "number")}
                        {renderInput("Compliance %", "complianceSpecialistsPercent", "number")}
                        {renderInput("Audit %", "auditSpecialistsPercent", "number")}
                        {renderInput("Reporting %", "provisionSpecialistsPercent", "number")}
                    </div>
                </div>
            </div>
        )}

        {activeSection === 6 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderSelect("Calculation Auto", "taxCalculationAutomationRange", C.OPTS_AUTOMATION)}
                {renderSelect("Payment Auto", "taxPaymentAutomationRange", C.OPTS_AUTOMATION)}
                {renderSelect("Compliance Auto", "complianceAutomationCoverageRange", C.OPTS_AUTOMATION)}
                {renderRadio("Regulatory Response", "regulatoryChangeResponseTime", C.OPTS_REGULATORY_RESPONSE)}
            </div>
        )}

        {activeSection === 7 && (
            <div className="space-y-6">
                {renderRadio("Data Architecture", "taxDataArchitecture", C.OPTS_TAX_DATA_ARCH)}
                {renderSelect("Data Hosting", "dataHostingPlatform", C.OPTS_DATA_HOSTING)}
                {renderSelect("Filing Volume", "annualTaxFilingsRange", C.OPTS_FILINGS)}
                {renderRadio("Data Confidence", "dataConfidence", C.OPTS_DATA_CONFIDENCE)}
            </div>
        )}

        {activeSection === 8 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderSelect("Arch Pattern", "architecturePattern", C.OPTS_ARCH_PATTERN)}
                {renderSelect("Data Flow", "dataFlow", C.OPTS_DATA_FLOW)}
                {renderSelect("Cloud", "cloudProvider", C.OPTS_CLOUD)}
                {renderSelect("Dev Stack", "primaryProgrammingLanguages", C.OPTS_LANGUAGES)}
            </div>
        )}

        {activeSection === 9 && (
            <div className="space-y-6">
                <div className="bg-green-50/50 p-6 rounded-2xl border border-green-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-green-900">GenAI Integration</p>
                        <p className="text-xs text-green-700">Have you deployed LLM tools?</p>
                    </div>
                    <button onClick={() => handleChange('aiAdopted', !formData.aiAdopted)} className={`w-14 h-8 rounded-full p-1 transition-all ${formData.aiAdopted ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <div className={`w-6 h-6 bg-white rounded-full transition-all ${formData.aiAdopted ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>
                {formData.aiAdopted && renderSelect("Maturity Phase", "genAIAdoptionStage", C.OPTS_GENAI_STAGE)}
                {renderInput("Financial Close (Days)", "financialCloseTotalDays", "number")}
                {renderInput("Tax Close (Day)", "financialCloseCompletionDay", "number")}
            </div>
        )}
      </div>

      <div className="mt-8 flex justify-between">
        <button onClick={() => activeSection > 1 && setActiveSection(activeSection - 1)} disabled={activeSection === 1} className="px-6 py-3 bg-white border rounded-xl font-bold flex items-center gap-2 hover:bg-gray-50 disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={handleNext} className="px-10 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-900 shadow-xl shadow-primary/20">
            {activeSection === C.SECTIONS.length ? 'Complete' : 'Continue'} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default Survey;