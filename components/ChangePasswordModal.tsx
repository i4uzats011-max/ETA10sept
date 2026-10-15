'use client';

import React, { useState, useEffect } from 'react';
import {
  Key,
  Lock,
  Eye,
  EyeOff,
  Shield,
  ShieldAlert,
  CheckCircle2,
  X,
  Users,
  Sparkles,
  RefreshCw,
  Clock,
  Terminal,
  Truck,
  FileText,
  UserCheck,
} from 'lucide-react';

interface RoleStatusItem {
  role: 'admin' | 'developer' | 'staff' | 'biller' | 'dispatcher';
  roleName: string;
  isCustom: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole?: string;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  currentRole: propRole,
}: ChangePasswordModalProps) {
  const [activeTab, setActiveTab] = useState<'self' | 'manage'>('self');
  const [userRole, setUserRole] = useState<string>(propRole || '');
  const [canManageAll, setCanManageAll] = useState<boolean>(false);
  const [roles, setRoles] = useState<RoleStatusItem[]>([]);
  const [loadingInfo, setLoadingInfo] = useState<boolean>(false);

  // Self password form state
  const [selfCurrentPassword, setSelfCurrentPassword] = useState('');
  const [selfNewPassword, setSelfNewPassword] = useState('');
  const [selfConfirmPassword, setSelfConfirmPassword] = useState('');
  const [showSelfCurrent, setShowSelfCurrent] = useState(false);
  const [showSelfNew, setShowSelfNew] = useState(false);
  const [showSelfConfirm, setShowSelfConfirm] = useState(false);
  const [isSelfSubmitting, setIsSelfSubmitting] = useState(false);

  // Manage any role form state
  const [selectedTargetRole, setSelectedTargetRole] = useState<
    'admin' | 'developer' | 'staff' | 'biller' | 'dispatcher'
  >('staff');
  const [targetNewPassword, setTargetNewPassword] = useState('');
  const [targetConfirmPassword, setTargetConfirmPassword] = useState('');
  const [showTargetNew, setShowTargetNew] = useState(false);
  const [showTargetConfirm, setShowTargetConfirm] = useState(false);
  const [isTargetSubmitting, setIsTargetSubmitting] = useState(false);

  // Feedback messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch status on modal open
  const fetchAuthInfo = async () => {
    setLoadingInfo(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/change-password');
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.role || propRole || '');
        setCanManageAll(Boolean(data.canManageAll));
        if (data.roles && Array.isArray(data.roles)) {
          setRoles(data.roles);
        }
      }
    } catch (err) {
      console.error('Failed to load password manager info:', err);
    } finally {
      setLoadingInfo(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAuthInfo();
      setSuccessMessage(null);
      setErrorMessage(null);
      setSelfCurrentPassword('');
      setSelfNewPassword('');
      setSelfConfirmPassword('');
      setTargetNewPassword('');
      setTargetConfirmPassword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Self Password Change
  const handleSelfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (selfNewPassword !== selfConfirmPassword) {
      setErrorMessage('New password and confirm password do not match.');
      return;
    }
    if (selfNewPassword.length < 4) {
      setErrorMessage('New password must be at least 4 characters long.');
      return;
    }

    setIsSelfSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_self',
          currentPassword: selfCurrentPassword,
          newPassword: selfNewPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password.');
      }

      setSuccessMessage(data.message || 'Password changed successfully!');
      setSelfCurrentPassword('');
      setSelfNewPassword('');
      setSelfConfirmPassword('');
      fetchAuthInfo();
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred.');
    } finally {
      setIsSelfSubmitting(false);
    }
  };

  // Handle Admin/Developer Changing Any Role Password
  const handleTargetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (targetNewPassword !== targetConfirmPassword) {
      setErrorMessage('New password and confirm password do not match.');
      return;
    }
    if (targetNewPassword.length < 4) {
      setErrorMessage('New password must be at least 4 characters long.');
      return;
    }

    setIsTargetSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_any',
          targetRole: selectedTargetRole,
          newPassword: targetNewPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update role password.');
      }

      setSuccessMessage(data.message || `Password for ${selectedTargetRole} updated successfully!`);
      setTargetNewPassword('');
      setTargetConfirmPassword('');
      fetchAuthInfo();
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred.');
    } finally {
      setIsTargetSubmitting(false);
    }
  };

  // Quick Random Password Generator
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTargetNewPassword(result);
    setTargetConfirmPassword(result);
    setShowTargetNew(true);
    setShowTargetConfirm(true);
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'developer':
        return <Terminal className="w-4 h-4 text-cyan-400" />;
      case 'admin':
        return <Shield className="w-4 h-4 text-red-400" />;
      case 'staff':
        return <Users className="w-4 h-4 text-blue-400" />;
      case 'biller':
        return <FileText className="w-4 h-4 text-amber-400" />;
      case 'dispatcher':
        return <Truck className="w-4 h-4 text-emerald-400" />;
      default:
        return <UserCheck className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl shadow-inner">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Password Security & Credentials
              </h2>
              <p className="text-xs text-slate-400">
                {canManageAll
                  ? 'Manage your self password and assign passwords for all system roles'
                  : 'Update your account access password'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher (Visible only for Super Admin and Developer Admin) */}
        {canManageAll && (
          <div className="flex border-b border-slate-800 bg-slate-950/50 p-1.5">
            <button
              onClick={() => {
                setActiveTab('self');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition ${
                activeTab === 'self'
                  ? 'bg-red-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Change My Password</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('manage');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition ${
                activeTab === 'manage'
                  ? 'bg-red-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Change Any Role Password</span>
              <span className="bg-red-500/20 text-red-300 text-[10px] px-1.5 py-0.5 rounded-full border border-red-500/30">
                Admin
              </span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {/* Status feedback alerts */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-800 text-red-300 text-xs sm:text-sm flex items-start space-x-2.5 animate-in slide-in-from-top-1">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs sm:text-sm flex items-start space-x-2.5 animate-in slide-in-from-top-1">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{successMessage}</div>
            </div>
          )}

          {/* TAB 1: Self Password Change */}
          {activeTab === 'self' && (
            <form onSubmit={handleSelfSubmit} className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">Current Logged-in Role:</span>
                <span className="text-xs font-bold text-white capitalize px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700">
                  {userRole || 'Standard User'}
                </span>
              </div>

              {/* Current Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showSelfCurrent ? 'text' : 'password'}
                    value={selfCurrentPassword}
                    onChange={(e) => setSelfCurrentPassword(e.target.value)}
                    placeholder="Enter your current password..."
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                  />
                  <div className="absolute left-3 top-2.5 text-slate-500">
                    <Lock className="w-4 h-4 text-slate-400" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSelfCurrent(!showSelfCurrent)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showSelfCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showSelfNew ? 'text' : 'password'}
                    value={selfNewPassword}
                    onChange={(e) => setSelfNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 4 characters)..."
                    required
                    minLength={4}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                  />
                  <div className="absolute left-3 top-2.5 text-slate-500">
                    <Key className="w-4 h-4 text-slate-400" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSelfNew(!showSelfNew)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showSelfNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showSelfConfirm ? 'text' : 'password'}
                    value={selfConfirmPassword}
                    onChange={(e) => setSelfConfirmPassword(e.target.value)}
                    placeholder="Confirm new password..."
                    required
                    minLength={4}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600 text-sm"
                  />
                  <div className="absolute left-3 top-2.5 text-slate-500">
                    <Key className="w-4 h-4 text-slate-400" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSelfConfirm(!showSelfConfirm)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showSelfConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSelfSubmitting}
                  className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-red-950/40 disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isSelfSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Update My Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Admin/Developer Manage All Roles */}
          {activeTab === 'manage' && canManageAll && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Select Role to Change Password:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(
                    roles.length > 0
                      ? roles
                      : [
                          { role: 'admin' as const, roleName: 'Super Admin', isCustom: false, updatedAt: null, updatedBy: null },
                          { role: 'developer' as const, roleName: 'Developer Admin', isCustom: false, updatedAt: null, updatedBy: null },
                          { role: 'staff' as const, roleName: 'Internal Employee', isCustom: false, updatedAt: null, updatedBy: null },
                          { role: 'biller' as const, roleName: 'Biller', isCustom: false, updatedAt: null, updatedBy: null },
                          { role: 'dispatcher' as const, roleName: 'Dispatcher', isCustom: false, updatedAt: null, updatedBy: null },
                        ]
                  ).map((r: RoleStatusItem) => {
                    const isSelected = selectedTargetRole === r.role;
                    return (
                      <button
                        key={r.role}
                        type="button"
                        onClick={() => {
                          setSelectedTargetRole(
                            r.role as 'admin' | 'developer' | 'staff' | 'biller' | 'dispatcher'
                          );
                          setErrorMessage(null);
                          setSuccessMessage(null);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-red-950/50 border-red-500 text-white shadow-md shadow-red-950/40 ring-1 ring-red-500'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-1">
                          {getRoleIcon(r.role)}
                          <span className="font-bold text-xs truncate">{r.roleName}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span
                            className={
                              r.isCustom ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                            }
                          >
                            {r.isCustom ? 'Custom DB' : 'Env Default'}
                          </span>
                          {r.updatedAt && (
                            <span className="flex items-center gap-0.5 text-[9px] text-slate-500">
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(r.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form to update selected role password */}
              <form onSubmit={handleTargetSubmit} className="space-y-4 pt-1">
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getRoleIcon(selectedTargetRole)}
                    <div>
                      <span className="text-xs text-slate-400 block">Updating Password For:</span>
                      <span className="text-sm font-bold text-white capitalize">
                        {roles.find((r) => r.role === selectedTargetRole)?.roleName ||
                          selectedTargetRole}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 text-cyan-300 text-xs font-semibold transition"
                    title="Generate a secure random password"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Generate Random</span>
                  </button>
                </div>

                {/* Target New Password */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showTargetNew ? 'text' : 'password'}
                      value={targetNewPassword}
                      onChange={(e) => setTargetNewPassword(e.target.value)}
                      placeholder={`Enter new password for ${selectedTargetRole}...`}
                      required
                      minLength={4}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600 text-sm font-mono"
                    />
                    <div className="absolute left-3 top-2.5 text-slate-500">
                      <Key className="w-4 h-4 text-slate-400" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTargetNew(!showTargetNew)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showTargetNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Target Confirm Password */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showTargetConfirm ? 'text' : 'password'}
                      value={targetConfirmPassword}
                      onChange={(e) => setTargetConfirmPassword(e.target.value)}
                      placeholder="Confirm new password..."
                      required
                      minLength={4}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600 text-sm font-mono"
                    />
                    <div className="absolute left-3 top-2.5 text-slate-500">
                      <Key className="w-4 h-4 text-slate-400" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTargetConfirm(!showTargetConfirm)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showTargetConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isTargetSubmitting}
                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-red-950/40 disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {isTargetSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Updating {selectedTargetRole} Password...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Save & Apply New Password</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Active Session: <strong className="text-white capitalize">{userRole || 'User'}</strong></span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
