
import { Submission, User, UserRecord } from '../types';

// Initial Authorized Admin Emails
const INITIAL_ADMINS = ['admin@taxbenchmark.com', 'jiyangu923@gmail.com'];

// Configuration for mock generation
const INDUSTRIES = [
  'technology', 'financial_services', 'healthcare_life_sciences', 
  'industrial_manufacturing', 'consumer_goods_retail', 
  'energy_utilities', 'telecommunications_media', 'transportation_logistics'
];
const REVENUES = ['100m_1b', '1b_10b', '10b_50b', 'over_50b'];

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const createRandomSubmission = (id: string, userId: string, userName: string): Submission => {
  const industry = pick(INDUSTRIES);
  const revenue = pick(REVENUES);
  const isModern = industry === 'technology' || industry === 'financial_services' || Math.random() > 0.7;
  const isLarge = revenue === '10b_50b' || revenue === 'over_50b';
  const automationSet = isModern ? ['70_90', '90_99', '99_plus'] : ['under_40', '40_70', '70_90'];
  const aiAdopted = isModern ? Math.random() > 0.3 : Math.random() > 0.8;

  const genPercentages = (count: number) => {
    let parts = Array.from({length: count}, () => Math.random());
    let total = parts.reduce((a, b) => a + b, 0);
    return parts.map(p => Math.round((p / total) * 100));
  };

  const techP = genPercentages(5);
  const bizP = genPercentages(5);

  return {
    id,
    userId,
    userName,
    status: 'approved',
    submittedAt: new Date(Date.now() - Math.floor(Math.random() * 90 * 24 * 60 * 60 * 1000)).toISOString(),
    companyProfile: [pick(['public', 'private_pe', 'multinational'])],
    participationGoal: ['benchmark', 'maturity_assessment'],
    respondentRole: isModern ? 'tax_technology' : 'tax_professionals',
    ownedTaxFunctions: ['indirect_tax', 'reporting_provision'],
    organizationScope: isLarge ? 'broad' : 'moderate',
    industry,
    revenueRange: revenue,
    taxTechLocation: isModern ? 'product_engineering' : 'tax_finance',
    centralizationModel: isLarge ? 'centralized' : 'hybrid',
    taxTechApproach: isModern ? 'in_house' : 'vendor',
    taxOutsourcingExtent: isModern ? 'mostly_in_house' : 'hybrid',
    taxTechFTEsRange: isLarge ? (isModern ? 'over_100' : '31_100') : '6_15',
    taxTechOutsourcedResourcesFTEsRange: '1_5',
    taxTechSkillMixFrontendPercent: techP[0],
    taxTechSkillMixBackendPercent: techP[1],
    taxTechSkillMixDataEngineeringPercent: techP[2],
    taxTechSkillMixDevOpsPercent: techP[3],
    taxTechSkillMixOtherPercent: techP[4],
    taxBusinessFTEsRange: isLarge ? '51_150' : '10_25',
    taxBusinessOutsourcingFTEsRange: '10_25',
    dataHostingPlatform: isModern ? 'snowflake' : 'no',
    planningSpecialistsPercent: bizP[0],
    complianceSpecialistsPercent: bizP[1],
    auditSpecialistsPercent: bizP[2],
    provisionSpecialistsPercent: bizP[3],
    otherSpecialistsPercent: bizP[4],
    taxCalculationAutomationRange: pick(automationSet),
    taxPaymentAutomationRange: pick(automationSet),
    withholdingTaxAutomationRange: pick(automationSet), 
    complianceAutomationCoverageRange: pick(automationSet),
    regulatoryChangeResponseTime: isModern ? 'under_1_month' : '3_6_months',
    dataConfidence: isModern ? 'very_confident' : 'neutral',
    taxDataArchitecture: isModern ? 'data_lake' : 'erp_only',
    annualTaxFilingsRange: isLarge ? 'over_20k' : '100_1k',
    jurisdictionsCovered: isLarge ? randomInt(50, 150) : randomInt(5, 20),
    architecturePattern: isModern ? 'microservices' : 'monolith',
    dataFlow: isModern ? 'real_time_streaming' : 'batch_etl',
    primaryProgrammingLanguages: isModern ? 'python' : 'java_kotlin',
    cloudProvider: isModern ? 'aws' : 'on_prem',
    cicdTools: isModern ? 'github_actions' : 'jenkins',
    financialCloseTotalDays: isModern ? randomInt(3, 7) : randomInt(8, 14),
    financialCloseCompletionDay: isModern ? randomInt(1, 4) : randomInt(5, 10),
    aiAdopted: aiAdopted,
    genAIAdoptionStage: aiAdopted ? pick(['poc', 'production']) : undefined,
    aiUseCases: aiAdopted ? 'Automated GL classification and regulatory mapping.' : undefined,
    additionalNotes: `Auto-generated benchmark data.`
  };
};

const generateMockData = (): Submission[] => {
  const submissions: Submission[] = [];
  submissions.push(createRandomSubmission('sub-user-jiyangu', 'user-jiyangu', 'Jiyangu'));
  for (let i = 1; i <= 30; i++) {
    submissions.push(createRandomSubmission(`mock-sub-${i}`, `mock-user-${i}`, `Participant ${i}`));
  }
  return submissions;
}

export class MockStore {
  private currentUser: User | null = null;
  private users: UserRecord[] = [];
  private submissions: Submission[] = [];
  private webhookUrl: string = '';
  private adminEmails: string[] = INITIAL_ADMINS;

  private STORAGE_KEY = 'tax_benchmark_db_submissions'; 
  private USERS_KEY = 'tax_benchmark_db_users';
  private SETTINGS_KEY = 'tax_benchmark_db_settings';
  private SESSION_KEY = 'tax_benchmark_db_user_session';

  constructor() {
    this.init();
  }

  private init() {
    // 1. Load Settings
    const storedSettings = localStorage.getItem(this.SETTINGS_KEY);
    if (storedSettings) {
      try {
        const settings = JSON.parse(storedSettings);
        this.webhookUrl = settings.webhookUrl || '';
        if (settings.adminEmails) this.adminEmails = settings.adminEmails;
      } catch (e) {}
    }

    // 2. Load Users
    const storedUsers = localStorage.getItem(this.USERS_KEY);
    if (storedUsers) {
      try {
        this.users = JSON.parse(storedUsers);
      } catch (e) {}
    } else {
      // Seed initial users
      this.users = [
        { id: 'user-jiyangu', name: 'Jiyangu', email: 'jiyangu923@gmail.com', password: 'password123', role: 'admin' },
        { id: 'admin-1', name: 'Admin User', email: 'admin@taxbenchmark.com', password: 'password123', role: 'admin' },
        { id: 'user-1', name: 'Standard User', email: 'user@company.com', password: 'password123', role: 'user' }
      ];
      this.saveUsers();
    }

    // 3. Load Submissions
    const storedSubs = localStorage.getItem(this.STORAGE_KEY);
    if (storedSubs) {
      try {
        this.submissions = JSON.parse(storedSubs);
      } catch (e) {
        this.submissions = generateMockData();
        this.persist();
      }
    } else {
        this.submissions = generateMockData();
        this.persist();
    }

    // 4. Load Session
    const storedUser = localStorage.getItem(this.SESSION_KEY);
    if (storedUser) {
        try { this.currentUser = JSON.parse(storedUser); } catch (e) {}
    }
  }

  // Auth Operations
  register(name: string, email: string, password: string): User {
    const existing = this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) throw new Error("Email already registered.");

    const isAdmin = this.adminEmails.some(e => e.toLowerCase() === email.toLowerCase());
    const newUser: UserRecord = {
      id: `user-${Date.now()}`,
      name,
      email: email.toLowerCase(),
      password,
      role: isAdmin ? 'admin' : 'user'
    };

    this.users.push(newUser);
    this.saveUsers();
    
    // Auto login
    const sessionUser: User = { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role };
    this.currentUser = sessionUser;
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(this.currentUser));
    return this.currentUser;
  }

  login(email: string, password?: string): User {
    const userRecord = this.users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!userRecord) throw new Error("Account not found. Please register first.");

    // Password check — always enforced for password-based login; skipped only
    // when called internally from loginWithGoogle (no password argument passed).
    if (password !== undefined && userRecord.password !== password) {
      throw new Error("Incorrect password.");
    }

    // Always resolve role from the live adminEmails list so that role changes
    // made via the Admin panel take effect on the next login.
    const role = this.adminEmails.some(e => e.toLowerCase() === userRecord.email.toLowerCase()) ? 'admin' : 'user';
    if (userRecord.role !== role) {
      userRecord.role = role;
      this.saveUsers();
    }

    this.currentUser = { id: userRecord.id, name: userRecord.name, email: userRecord.email, role };
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(this.currentUser));
    return this.currentUser;
  }

  loginWithGoogle(email: string, name?: string): User {
    // Only allow pre-registered users to sign in via Google.
    // Auto-registration is intentionally disabled to prevent arbitrary
    // Google accounts from gaining access.
    const userRecord = this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!userRecord) {
      throw new Error("This email is not registered. Please contact an admin to get access.");
    }
    return this.login(email);
  }

  // Added missing updateUserProfile method
  updateUserProfile(updatedUser: User): User {
    const userIndex = this.users.findIndex(u => u.id === updatedUser.id);
    if (userIndex !== -1) {
      // Preserve password from original record if it exists
      this.users[userIndex] = { ...this.users[userIndex], ...updatedUser };
      this.saveUsers();
    }
    if (this.currentUser && this.currentUser.id === updatedUser.id) {
      this.currentUser = { ...this.currentUser, ...updatedUser };
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(this.currentUser));
    }
    return updatedUser;
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem(this.SESSION_KEY);
  }

  private saveUsers() {
    localStorage.setItem(this.USERS_KEY, JSON.stringify(this.users));
  }

  // System Settings
  getWebhookUrl() { return this.webhookUrl; }
  setWebhookUrl(url: string) { this.webhookUrl = url; this.saveSettings(); }
  getAdminEmails() { return this.adminEmails; }
  addAdminEmail(email: string) {
    const normalized = email.toLowerCase();
    if (!this.adminEmails.some(e => e.toLowerCase() === normalized)) {
      this.adminEmails.push(normalized);
      this.saveSettings();
      // Promote existing registered user immediately
      const u = this.users.find(user => user.email.toLowerCase() === normalized);
      if (u) { u.role = 'admin'; this.saveUsers(); }
    }
  }
  removeAdminEmail(email: string) {
    const normalized = email.toLowerCase();
    this.adminEmails = this.adminEmails.filter(e => e.toLowerCase() !== normalized);
    this.saveSettings();
    // Downgrade existing registered user immediately
    const u = this.users.find(user => user.email.toLowerCase() === normalized);
    if (u) { u.role = 'user'; this.saveUsers(); }
  }

  private saveSettings() {
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify({ webhookUrl: this.webhookUrl, adminEmails: this.adminEmails }));
  }

  getCurrentUser() { return this.currentUser; }

  // Submission Operations
  createSubmission(data: Omit<Submission, 'id' | 'userId' | 'userName' | 'status' | 'submittedAt'>) {
    if (!this.currentUser) throw new Error('Must be logged in');
    this.submissions = this.submissions.filter(s => s.userId !== this.currentUser!.id);
    const newSubmission: Submission = {
      ...data,
      id: `sub-${Date.now()}`,
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };
    this.submissions.push(newSubmission);
    this.persist();
    return newSubmission;
  }

  getSubmissions(): Submission[] { return [...this.submissions]; }
  updateSubmissionStatus(id: string, status: 'approved' | 'rejected') {
    const sub = this.submissions.find(s => s.id === id);
    if (sub) { sub.status = status; this.persist(); }
  }
  deleteSubmission(id: string) { this.submissions = this.submissions.filter(s => s.id !== id); this.persist(); }
  deleteAllSubmissions() { this.submissions = []; this.persist(); }
  private persist() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.submissions)); }

  // Export/Import
  exportDatabase() {
      const data = { 
        submissions: this.submissions, 
        users: this.users, 
        settings: { webhookUrl: this.webhookUrl, adminEmails: this.adminEmails } 
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `benchmark_full_db.json`;
      link.click();
  }

  async importDatabase(file: File): Promise<boolean> {
      return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
              try {
                  const data = JSON.parse(e.target?.result as string);
                  if (data.submissions) this.submissions = data.submissions;
                  if (data.users) this.users = data.users;
                  if (data.settings) {
                    this.webhookUrl = data.settings.webhookUrl || '';
                    this.adminEmails = data.settings.adminEmails || INITIAL_ADMINS;
                  }
                  this.persist();
                  this.saveUsers();
                  this.saveSettings();
                  resolve(true);
              } catch (err) { resolve(false); }
          };
          reader.readAsText(file);
      });
  }
}

export const mockStore = new MockStore();
