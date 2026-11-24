'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Copy,
  Check,
  Key,
  Smartphone,
  Mail,
  Shield,
  Trash2,
  RefreshCw,
  Search,
  ExternalLink,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

export default function SalesTeamMaster() {
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New member form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [salesNotes, setSalesNotes] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successInvite, setSuccessInvite] = useState<string | null>(null);

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales/team');
      const data = await res.json();
      if (data.success && Array.isArray(data.team)) {
        setTeam(data.team);
      }
    } catch (e) {
      console.error('Failed to fetch sales team:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password.trim()) {
      setErrorMsg('Full Name, Username, and Password are mandatory.');
      return;
    }

    setCreating(true);
    setErrorMsg('');
    setSuccessInvite(null);

    try {
      const res = await fetch('/api/sales/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim().toLowerCase(),
          password: password.trim(),
          phone: phone.trim(),
          email: email.trim(),
          salesNotes: salesNotes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create sales team member');
      }

      setSuccessInvite(data.shareableInvite);
      fetchTeam();
      // Reset form
      setName('');
      setUsername('');
      setPassword('');
      setPhone('');
      setEmail('');
      setSalesNotes('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating user');
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (user: any) => {
    try {
      await fetch('/api/sales/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          isActive: !user.isActive,
        }),
      });
      fetchTeam();
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  };

  const handleDelete = async (user: any) => {
    if (!confirm(`Are you sure you want to remove ${user.name || user.username} from the sales team?`)) return;
    try {
      await fetch(`/api/sales/team?id=${user._id}`, { method: 'DELETE' });
      fetchTeam();
    } catch (e) {
      console.error('Failed to delete user:', e);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let res = 'sales';
    for (let i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(res);
  };

  const filteredTeam = team.filter((m) => {
    const q = search.toLowerCase();
    return (
      (m.name || '').toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q) ||
      (m.phone || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <span>Sales Team Master & Profile Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Create and manage sales team members, generate login credentials, and share access via WhatsApp.
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            onClick={() => {
              setShowCreateModal(true);
              setSuccessInvite(null);
              setErrorMsg('');
              generateRandomPassword();
            }}
            className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center space-x-1.5 transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add New Sales Executive</span>
          </button>
        </div>
      </div>

      {/* Success Modal / Invite Card after creation */}
      {successInvite && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2 text-emerald-800 font-bold text-sm">
              <Check className="w-5 h-5 bg-emerald-600 text-white rounded-full p-0.5" />
              <span>Sales Team Member Created Successfully! Share Credentials on WhatsApp:</span>
            </div>
            <button
              onClick={() => setSuccessInvite(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              ✕ Close
            </button>
          </div>

          <div className="mt-3 bg-white border border-emerald-200 rounded-lg p-4 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-xs">
            {successInvite}
          </div>

          <div className="mt-3 flex items-center space-x-2">
            <button
              onClick={() => copyToClipboard(successInvite, 'success-invite')}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-medium flex items-center space-x-1.5 shadow-xs"
            >
              {copiedId === 'success-invite' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId === 'success-invite' ? 'Copied to Clipboard!' : 'Copy WhatsApp Message'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Team Members List */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team member by name or ID..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="text-xs text-slate-600 flex items-center space-x-3">
            <span>
              Total Sales Executives: <strong>{team.length}</strong>
            </span>
            <button
              onClick={fetchTeam}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-600 transition"
              title="Refresh Team List"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 uppercase text-[11px] tracking-wider">
                <th className="py-2.5 px-4">Sales Executive Name</th>
                <th className="py-2.5 px-4">User ID (Login)</th>
                <th className="py-2.5 px-4">Password</th>
                <th className="py-2.5 px-4">Phone (WhatsApp)</th>
                <th className="py-2.5 px-4">Assigned Consignments</th>
                <th className="py-2.5 px-4">Account Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">
                    Loading sales team members...
                  </td>
                </tr>
              ) : filteredTeam.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">
                    No sales team members found. Click &quot;Add New Sales Executive&quot; above to create one.
                  </td>
                </tr>
              ) : (
                filteredTeam.map((member) => {
                  const shareText = `👋 *Hello ${member.name}!*
Here are your credentials for the *US International Logistics Sales Portal*:
🌐 *Link:* ${typeof window !== 'undefined' ? window.location.origin : ''}/admin/login
👤 *User ID:* ${member.username}
🔑 *Password:* ${member.plainPasswordView || '******'}
Please review your assigned cargo and discuss rates.`;

                  return (
                    <tr key={member._id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {member.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-700 font-medium">
                        {member.username}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {member.plainPasswordView ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {member.plainPasswordView}
                          </span>
                        ) : (
                          '••••••••'
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {member.phone ? (
                          <span className="flex items-center space-x-1">
                            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{member.phone}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800">
                          {member.assignedCount || 0} Receipts
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => toggleStatus(member)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition ${
                            member.isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                          }`}
                        >
                          {member.isActive ? 'Active' : 'Deactivated'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {/* Copy WhatsApp Invite */}
                        <button
                          onClick={() => copyToClipboard(shareText, member._id)}
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition inline-flex items-center"
                          title="Copy WhatsApp Invite Credentials"
                        >
                          {copiedId === member._id ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        {/* Open in WhatsApp Web */}
                        {member.phone && (
                          <a
                            href={`https://wa.me/${member.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                              shareText
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-600 hover:text-green-700 hover:bg-green-50 rounded transition inline-flex items-center"
                            title="Send via WhatsApp Web"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(member)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition inline-flex items-center"
                          title="Remove Sales Member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Team Member Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-300">
            <div className="bg-emerald-700 text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-wide flex items-center space-x-2">
                <UserPlus className="w-4 h-4" />
                <span>Create Sales Team Member</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-full hover:bg-white/20 text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!username) {
                      setUsername(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]/g, '')
                          .substring(0, 12) + '_sales'
                      );
                    }
                  }}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Username / User ID *
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. rahul_sales"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Password *
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] text-emerald-700 hover:underline"
                  >
                    Auto-Generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Set password"
                    className="w-full px-3 py-2 pr-10 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  WhatsApp Mobile Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Territory / Notes
                </label>
                <input
                  type="text"
                  value={salesNotes}
                  onChange={(e) => setSalesNotes(e.target.value)}
                  placeholder="e.g. Delhi NCR / Textile & Electronics Party"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {errorMsg && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                  {errorMsg}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create & Generate WhatsApp Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
