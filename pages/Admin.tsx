import React, { useEffect, useState, useRef, useMemo } from 'react';
import { mockStore } from '../services/mockStore';
import { Submission, User } from '../types';
import { 
    Check, X, Eye, XCircle, RefreshCw, Trash2, 
    FileSpreadsheet, CloudSync, ShieldAlert, Save,
    CheckCircle2, Users, Plus, Mail, ShieldCheck, 
    UserPlus, Database, Download, Upload, AlertTriangle,
    Activity, HardDrive, Info, Settings, Search, Filter, RotateCcw,
    ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as C from '../constants';

const Admin: React.FC<{ user: User | null }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'submissions' | 'sync' | 'admins' | 'system'>('submissions');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');

  const [webhookUrl, setWebhookUrl] = useState(mockStore.getWebhookUrl());
  const [adminEmails, setAdminEmails] = useState<string[]>(mockStore.getAdminEmails());
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const loadSubmissions = () => {
    setSubmissions(mockStore.getSubmissions());
  };

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }
    loadSubmissions();
  }, [user, navigate]);

  // Combined Filtering Logic
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(sub => {
      const matchesSearch = sub.userName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
      const matchesIndustry = industryFilter === 'all' || sub.industry === industryFilter;
      return matchesSearch && matchesStatus && matchesIndustry;
    });
  }, [submissions, searchTerm, statusFilter, industryFilter]);

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setIndustryFilter('all');
  };

  const handleUpdateStatus = (id: string, status: 'approved' | 'rejected', e?: React.MouseEvent) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    mockStore.updateSubmissionStatus(id, status);
    loadSubmissions();
    if (selectedSub && selectedSub.id === id) {
        setSelectedSub(null); 
    }
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (window.confirm('PERMANENTLY delete this submission?')) {
        mockStore.deleteSubmission(id);
        loadSubmissions();
        if (selectedSub && selectedSub.id === id) setSelectedSub(null);
    }
  };

  const handleDeleteAll = () => {
    if (window.confirm('DANGER: This will delete ALL submissions. Proceed?')) {
        mockStore.deleteAllSubmissions();
        loadSubmissions();
    }
  }

  const handleAddAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail || !newAdminEmail.includes('@')) return;
    mockStore.addAdminEmail(newAdminEmail);
    setAdminEmails(mockStore.getAdminEmails());
    setNewAdminEmail('');
    setSyncMessage({ type: 'success', text: 'Admin authorized.' });
    setTimeout(() => setSyncMessage(null), 3000);
  };

  const handleRemoveAdmin = (email: string) => {
    if (email.toLowerCase() === user?.email.toLowerCase()) {
        alert("You cannot remove your own admin access.");
        return;
    }
    if (window.confirm(`Remove admin access for ${email}?`)) {
        mockStore.removeAdminEmail(email);
        setAdminEmails(mockStore.getAdminEmails());
    }
  };

  const handleBackup = () => {
      mockStore.exportDatabase();
      setSyncMessage({ type: 'success', text: 'Full database backup downloaded.' });
      setTimeout(() => setSyncMessage(null), 3000);
  };

  const handleRestoreClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (window.confirm('WARNING: Restoring will overwrite your current database. Continue?')) {
          const success = await mockStore.importDatabase(file);
          if (success) {
              setSyncMessage({ type: 'success', text: 'Database restored successfully. Refreshing...' });
              setTimeout(() => window.location.reload(), 1500);
          } else {
              setSyncMessage({ type: 'error', text: 'Invalid backup file format.' });
          }
      }
      e.target.value = ''; // Reset input
  };

  const handleSyncToSheets = async () => {
    if (!webhookUrl) return;
    setIsSyncing(true);
    try {
        await fetch(webhookUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ data: submissions }) });
        setSyncMessage({ type: 'success', text: 'Sync triggered!' });
    } catch (error) {
        setSyncMessage({ type: 'error', text: 'Sync failed.' });
    } finally {
        setIsSyncing(false);
    }
  };

  const saveWebhook = () => {
      mockStore.setWebhookUrl(webhookUrl);
      setSyncMessage({ type: 'success', text: 'Integration settings saved.' });
      setTimeout(() => setSyncMessage(null), 3000);
  };

  const getLabel = (options: { value: string; label: string }[], val?: string) => {
    if (!val) return '-';
    return options.find(o => o.value === val)?.label || val;
  };

  const DetailRow = ({ label, value }: { label: string, value: any }) => (
    <div className="py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 border-b border-gray-100 last:border-0 hover:bg-gray-50 text-sm">
        <dt className="font-medium text-gray-500">{label}</dt>
        <dd className="mt-1 text-gray-900 sm:mt-0 sm:col-span-2 break-words">{value !== undefined && value !== null && value !== '' ? value : '-'}</dd>
    </div>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <h4 className="bg-gray-100 px-6 py-2 text-sm font-bold text-gray-700 border-y border-gray-200 mt-4 first:mt-0">{title}</h4>
  );

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                   <Settings className="h-8 w-8 text-primary" /> Admin Central
                </h1>
                <p className="text-gray-500 text-sm mt-1 font-medium">Infrastructure & Governance Control Panel</p>
            </div>
            <div className="flex gap-3">
                <button onClick={loadSubmissions} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-xl shadow-sm text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all"><RefreshCw className="h-4 w-4" /> Refresh</button>
                <button onClick={handleDeleteAll} className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl shadow-sm text-sm font-bold text-red-700 hover:bg-red-100 transition-all"><ShieldAlert className="h-4 w-4" /> Clear DB</button>
            </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
            <nav className="-mb-px flex space-x-10">
                <button onClick={() => setActiveTab('submissions')} className={`pb-4 px-1 border-b-4 font-bold text-sm transition-all flex items-center gap-2.5 ${activeTab === 'submissions' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'}`}><Eye className="h-4 w-4" /> Submissions</button>
                <button onClick={() => setActiveTab('sync')} className={`pb-4 px-1 border-b-4 font-bold text-sm transition-all flex items-center gap-2.5 ${activeTab === 'sync' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'}`}><CloudSync className="h-4 w-4" /> Integration</button>
                <button onClick={() => setActiveTab('admins')} className={`pb-4 px-1 border-b-4 font-bold text-sm transition-all flex items-center gap-2.5 ${activeTab === 'admins' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'}`}><Users className="h-4 w-4" /> Team Access</button>
                <button onClick={() => setActiveTab('system')} className={`pb-4 px-1 border-b-4 font-bold text-sm transition-all flex items-center gap-2.5 ${activeTab === 'system' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'}`}><Database className="h-4 w-4" /> System & Data</button>
            </nav>
        </div>
        
        {activeTab === 'submissions' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Filter Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row items-end gap-6">
              <div className="flex-1 w-full">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Search Participant</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search by name..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="w-full md:w-48">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Status</label>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <select 
                    className="w-full pl-10 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm appearance-none outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="w-full md:w-64">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Industry</label>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <select 
                    className="w-full pl-10 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm appearance-none outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                  >
                    <option value="all">All Industries</option>
                    {C.OPTS_INDUSTRY.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <button 
                onClick={resetFilters}
                className="px-4 py-2.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-xl transition-all flex items-center gap-2 text-sm font-bold"
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
            </div>

            {/* Table Count */}
            <div className="flex justify-between items-center px-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Showing {filteredSubmissions.length} of {submissions.length} Records
              </span>
            </div>

            <div className="bg-white shadow-xl overflow-hidden border border-gray-200 sm:rounded-2xl">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-widest">User</th>
                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Industry Role</th>
                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Revenue</th>
                            <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-widest">Status</th>
                            <th className="px-6 py-4 text-right text-xs font-black text-gray-500 uppercase tracking-widest">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                    {filteredSubmissions.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="px-6 py-20 text-center">
                              <div className="flex flex-col items-center justify-center gap-4">
                                <Search className="h-10 w-10 text-gray-200" />
                                <div className="text-gray-400 font-bold text-sm">No results match your filter criteria.</div>
                                <button onClick={resetFilters} className="text-primary text-xs font-black uppercase tracking-widest hover:underline">Clear all filters</button>
                              </div>
                            </td>
                        </tr>
                    ) : (
                        filteredSubmissions.map((sub) => (
                            <tr key={sub.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer group" onClick={() => setSelectedSub(sub)}>
                                <td className="px-6 py-5 whitespace-nowrap">
                                    <div className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">{sub.userName}</div>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight mt-0.5">{new Date(sub.submittedAt).toLocaleDateString()}</div>
                                </td>
                                <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-600 font-medium">{getLabel(C.OPTS_RESPONDENT_ROLE, sub.respondentRole)}</td>
                                <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-600 font-medium">{getLabel(C.OPTS_REVENUE, sub.revenueRange)}</td>
                                <td className="px-6 py-5 whitespace-nowrap">
                                    <span className={`px-2.5 py-1 inline-flex text-[10px] font-black uppercase tracking-widest rounded-lg ${sub.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-100' : sub.status === 'rejected' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-orange-50 text-orange-700 border border-orange-100'}`}>
                                        {sub.status}
                                    </span>
                                </td>
                                <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-end gap-2">
                                        {sub.status === 'pending' && (
                                            <>
                                                <button onClick={(e) => handleUpdateStatus(sub.id, 'approved', e)} className="text-green-600 hover:bg-green-100 p-2 rounded-xl transition-all" title="Approve"><Check className="h-4 w-4" /></button>
                                                <button onClick={(e) => handleUpdateStatus(sub.id, 'rejected', e)} className="text-red-600 hover:bg-red-100 p-2 rounded-xl transition-all" title="Reject"><X className="h-4 w-4" /></button>
                                            </>
                                        )}
                                        <button onClick={(e) => handleDelete(sub.id, e)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>
          </div>
        )}

        {activeTab === 'sync' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-indigo-50 p-2 rounded-lg"><CloudSync className="h-6 w-6 text-primary"/></div>
                        <h3 className="text-lg font-bold text-gray-900">Google Sheets Integration</h3>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Webhook Endpoint URL</label>
                            <div className="flex gap-3">
                                <input type="text" className="flex-1 rounded-xl border-gray-200 shadow-sm p-3 border text-sm focus:ring-primary focus:border-primary outline-none" placeholder="https://script.google.com/macros/s/..." value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
                                <button onClick={saveWebhook} className="inline-flex items-center px-6 py-3 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 text-sm font-bold shadow-sm transition-all"><Save className="h-4 w-4 mr-2" /> Save</button>
                            </div>
                            <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                                Deploy an App Script Webhook to receive benchmark data in real-time. Use the <code>doPost(e)</code> trigger in your spreadsheet script.
                            </p>
                        </div>
                        <div className="pt-4 border-t border-gray-50">
                             <button onClick={handleSyncToSheets} disabled={isSyncing || !webhookUrl} className={`w-full flex justify-center items-center gap-3 py-4 rounded-xl text-white font-bold text-sm shadow-xl transition-all active:scale-[0.98] ${isSyncing || !webhookUrl ? 'bg-gray-200 cursor-not-allowed' : 'bg-primary hover:bg-indigo-900 shadow-primary/20'}`}>
                                {isSyncing ? <RefreshCw className="h-5 w-5 animate-spin" /> : <CloudSync className="h-5 w-5" />} {isSyncing ? 'Broadcasting Data...' : 'Manual Data Broadcast'}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-green-50 p-2 rounded-lg"><FileSpreadsheet className="h-6 w-6 text-green-600"/></div>
                            <h3 className="text-lg font-bold text-gray-900">Flat File Export</h3>
                        </div>
                        <p className="text-sm text-gray-500 mb-8 leading-relaxed">Download all approved submissions in a standard CSV format for manual analysis in Excel or BI tools.</p>
                    </div>
                    <button onClick={() => {}} className="w-full py-4 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 active:scale-[0.98]">Download CSV Export</button>
                </div>
            </div>
        )}

        {activeTab === 'admins' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fadeIn">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-50 p-2 rounded-lg"><ShieldCheck className="h-6 w-6 text-indigo-600"/></div>
                            <h3 className="text-lg font-bold text-gray-900">Governance Team</h3>
                        </div>
                        <span className="text-[10px] font-black tracking-widest uppercase px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full">{adminEmails.length} Seats</span>
                    </div>
                    <ul className="space-y-3">
                        {adminEmails.map(email => (
                            <li key={email} className="flex justify-between items-center px-5 py-4 bg-gray-50/50 border border-gray-100 rounded-2xl hover:bg-white hover:border-indigo-100 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-indigo-600 shadow-sm"><Mail className="h-5 w-5"/></div>
                                    <div>
                                        <span className="text-sm font-bold text-gray-800">{email}</span>
                                        {email.toLowerCase() === user?.email.toLowerCase() && (
                                            <span className="ml-2 text-[8px] uppercase font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">Primary</span>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => handleRemoveAdmin(email)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100"><Trash2 className="h-4 w-4"/></button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-primary p-2 rounded-lg"><UserPlus className="h-6 w-6 text-white"/></div>
                        <h3 className="text-lg font-bold text-gray-900">Authorize Seat</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-8 font-medium leading-relaxed">Authorized accounts will receive immediate administrative bypass across all system modules.</p>
                    <form onSubmit={handleAddAdmin} className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Gmail / Workspace Identity</label>
                            <input 
                                type="email" 
                                required
                                className="block w-full rounded-xl border-gray-200 shadow-sm p-4 border focus:ring-primary focus:border-primary text-sm outline-none font-medium"
                                placeholder="name@company.com"
                                value={newAdminEmail}
                                onChange={(e) => setNewAdminEmail(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="w-full flex items-center justify-center gap-3 py-4 bg-primary text-white rounded-xl font-bold hover:bg-indigo-900 transition-all shadow-xl shadow-primary/20 active:scale-[0.98]">
                            <Plus className="h-5 w-5"/> Assign Privileges
                        </button>
                    </form>
                </div>
            </div>
        )}

        {activeTab === 'system' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="bg-indigo-50 p-2 rounded-lg"><Database className="h-6 w-6 text-primary"/></div>
                        <h3 className="text-lg font-bold text-gray-900">Data Portability</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                             <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                                <Download className="h-4 w-4 text-indigo-600" /> System Backup
                             </h4>
                             <p className="text-xs text-gray-500 mb-4 leading-relaxed">Download a complete snapshot of all surveys, settings, and user roles in a portable JSON format.</p>
                             <button onClick={handleBackup} className="w-full py-3 bg-white border border-indigo-200 text-indigo-700 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-all flex items-center justify-center gap-2">
                                Export Snapshot
                             </button>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                             <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                                <Upload className="h-4 w-4 text-primary" /> Database Restoration
                             </h4>
                             <p className="text-xs text-gray-500 mb-4 leading-relaxed">Restore the system from a previously saved snapshot. This will replace all current data.</p>
                             <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
                             <button onClick={handleRestoreClick} className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
                                Upload Snapshot
                             </button>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="bg-orange-50 p-2 rounded-lg"><Activity className="h-6 w-6 text-orange-600"/></div>
                        <h3 className="text-lg font-bold text-gray-900">Storage Health</h3>
                    </div>

                    <div className="space-y-8">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <HardDrive className="h-5 w-5 text-gray-400" />
                                <span className="text-sm font-bold text-gray-700">Submissions Pool</span>
                            </div>
                            <span className="text-xl font-black text-primary">{submissions.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Users className="h-5 w-5 text-gray-400" />
                                <span className="text-sm font-bold text-gray-700">Privileged Seats</span>
                            </div>
                            <span className="text-xl font-black text-primary">{adminEmails.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Activity className="h-5 w-5 text-gray-400" />
                                <span className="text-sm font-bold text-gray-700">System Integrity</span>
                            </div>
                            <span className="text-xs font-black uppercase text-green-600 px-2 py-1 bg-green-50 rounded border border-green-100">Healthy</span>
                        </div>

                        <div className="pt-6 border-t border-gray-50">
                             <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex gap-4">
                                <AlertTriangle className="h-6 w-6 text-orange-600 flex-shrink-0" />
                                <p className="text-[11px] text-orange-800 leading-relaxed font-medium">
                                    <strong>Persistence Note:</strong> This application uses persistent local storage. Your data remains in this browser across sessions. For cross-device mobility, please use the Backup & Restore features.
                                </p>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {syncMessage && (
            <div className={`mt-8 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold animate-fadeIn shadow-sm border ${
                syncMessage.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 
                syncMessage.type === 'warning' ? 'bg-orange-50 text-orange-800 border-orange-200' : 
                'bg-red-50 text-red-800 border-red-200'
            }`}>
                {syncMessage.type === 'success' ? <CheckCircle2 className="h-5 w-5"/> : 
                 syncMessage.type === 'warning' ? <AlertTriangle className="h-5 w-5" /> :
                 <XCircle className="h-5 w-5" />}
                {syncMessage.text}
            </div>
        )}
      </div>

      {/* Detail Modal Placeholder */}
      {selectedSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setSelectedSub(null)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden animate-bounceIn">
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">Detail Analysis</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-0.5">Submission ID: {selectedSub.id}</p>
                    </div>
                    <button onClick={() => setSelectedSub(null)} className="text-gray-400 hover:text-gray-900 transition-colors"><XCircle className="h-8 w-8" /></button>
                </div>
                <div className="h-[70vh] overflow-y-auto px-8 py-6">
                    <SectionHeader title="Core Data" />
                    <DetailRow label="Respondent" value={selectedSub.userName} />
                    <DetailRow label="Industry" value={getLabel(C.OPTS_INDUSTRY, selectedSub.industry)} />
                    <DetailRow label="Revenue Band" value={getLabel(C.OPTS_REVENUE, selectedSub.revenueRange)} />
                    <DetailRow label="Status" value={selectedSub.status.toUpperCase()} />
                    
                    <SectionHeader title="Governance & Organizational Model" />
                    <DetailRow label="Location" value={getLabel(C.OPTS_TAX_TECH_ORG_LOCATION, selectedSub.taxTechLocation)} />
                    <DetailRow label="Structure" value={getLabel(C.OPTS_CENTRALIZATION, selectedSub.centralizationModel)} />
                    
                    <SectionHeader title="Infrastructure (Estimated mid-points)" />
                    <DetailRow label="Tax Tech FTEs" value={getLabel(C.OPTS_FTE_TECH, selectedSub.taxTechFTEsRange)} />
                    <DetailRow label="Business FTEs" value={getLabel(C.OPTS_FTE_BUSINESS, selectedSub.taxBusinessFTEsRange)} />
                    
                    <SectionHeader title="Automation Performance" />
                    <DetailRow label="Calculations" value={getLabel(C.OPTS_AUTOMATION, selectedSub.taxCalculationAutomationRange)} />
                    <DetailRow label="Compliance" value={getLabel(C.OPTS_AUTOMATION, selectedSub.complianceAutomationCoverageRange)} />

                    <div className="mt-8 p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                        <h4 className="flex items-center gap-2 font-bold text-indigo-900 mb-2">
                           <Info className="h-4 w-4" /> Administrative Context
                        </h4>
                        <p className="text-xs text-indigo-700 leading-relaxed font-medium">
                            This respondent indicated AI adoption at the <strong>{getLabel(C.OPTS_GENAI_STAGE, selectedSub.genAIAdoptionStage)}</strong> stage. 
                            {selectedSub.aiUseCases && <span className="block mt-2 font-bold italic">"{selectedSub.aiUseCases}"</span>}
                        </p>
                    </div>
                </div>
                <div className="bg-gray-50/80 px-8 py-6 border-t border-gray-100 flex justify-end gap-4">
                    {selectedSub.status === 'pending' && (
                        <>
                            <button onClick={(e) => handleUpdateStatus(selectedSub.id, 'approved', e)} className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-600/20 active:scale-95">Approve Record</button>
                            <button onClick={(e) => handleUpdateStatus(selectedSub.id, 'rejected', e)} className="px-8 py-3 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-600/20 active:scale-95">Flag Inaccurate</button>
                        </>
                    )}
                    <button onClick={() => setSelectedSub(null)} className="px-8 py-3 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-700 hover:bg-gray-50 active:scale-95">Dismiss</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Admin;