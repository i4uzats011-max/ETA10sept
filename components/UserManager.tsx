'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  Trash2,
  Edit3,
  Search,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  X,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Terminal,
  FileText,
  Truck,
  UserCheck,
  Check,
  AlertTriangle,
  UserX,
  Clock,
  BadgeCheck,
} from 'lucide-react';
import { UserRole } from '@/lib/auth';

export interface UserItem {
  _id: string;
  username: string;
  name?: string;
  role: UserRole;
  isActive: boolean;
  createdBy?: string;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export default function UserManager() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showSelfResetModal, setShowSelfResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Target user for edit/reset/delete
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  // Form states: Create User
  const [createUsername, setCreateUsername] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('staff');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form states: Edit User / Assign Role
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [editIsActive, setEditIsActive] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Form states: Reset User Password
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Form states: Self Password Reset
  const [selfCurrentPassword, setSelfCurrentPassword] = useState('');
  const [selfNewPassword, setSelfNewPassword] = useState('');
  const [selfConfirmPassword, setSelfConfirmPassword] = useState('');
  const [showSelfCurrent, setShowSelfCurrent] = useState(false);
  const [showSelfNew, setShowSelfNew] = useState(false);
  const [isSelfResetting, setIsSelfResetting] = useState(false);

  // Form states: Delete User
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch Users
  const fetchUsers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load user list.');
      }
      const data = await res.json();
      if (data.users && Array.isArray(data.users)) {
        setUsers(data.users);
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to user service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Quick auto-dismiss for success alert
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchQuery =
        !q ||
        u.username.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q));

      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && u.isActive) ||
        (statusFilter === 'inactive' && !u.isActive);

      return matchQuery && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  // Role Stats Breakdown
  const roleStats = useMemo(() => {
    const stats = {
      total: users.length,
      developer: 0,
      admin: 0,
      biller: 0,
      dispatcher: 0,
      staff: 0,
      active: 0,
    };
    users.forEach((u) => {
      if (u.role in stats) {
        (stats as any)[u.role]++;
      }
      if (u.isActive) stats.active++;
    });
    return stats;
  }, [users]);

  // Helpers
  const generatePassword = (target: 'create' | 'reset') => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let res = '';
    for (let i = 0; i < 10; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (target === 'create') {
      setCreatePassword(res);
      setShowCreatePassword(true);
    } else {
      setResetNewPassword(res);
      setResetConfirmPassword(res);
      setShowResetNewPassword(true);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'developer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Terminal className="w-3.5 h-3.5" />
            Developer Admin
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30">
            <Shield className="w-3.5 h-3.5" />
            Super Admin
          </span>
        );
      case 'biller':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <FileText className="w-3.5 h-3.5" />
            Biller (बिलर)
          </span>
        );
      case 'dispatcher':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Truck className="w-3.5 h-3.5" />
            Dispatcher (डिस्पैचर)
          </span>
        );
      case 'staff':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <Users className="w-3.5 h-3.5" />
            Employee (Staff)
          </span>
        );
    }
  };

  // 1. Submit Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (createUsername.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (createPassword.trim().length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: createUsername.trim(),
          name: createName.trim(),
          password: createPassword.trim(),
          role: createRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user.');
      }

      setSuccess(data.message || `User ${createUsername} created successfully!`);
      setShowCreateModal(false);
      setCreateUsername('');
      setCreateName('');
      setCreatePassword('');
      setCreateRole('staff');
      fetchUsers(true);
    } catch (err: any) {
      setError(err.message || 'Error creating user.');
    } finally {
      setIsCreating(false);
    }
  };

  // 2. Open Edit / Assign Role Modal
  const openEditModal = (user: UserItem) => {
    setSelectedUser(user);
    setEditName(user.name || '');
    setEditRole(user.role);
    setEditIsActive(user.isActive);
    setShowEditModal(true);
    setError(null);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setError(null);
    setIsEditing(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser._id,
          name: editName.trim(),
          role: editRole,
          isActive: editIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user.');
      }

      setSuccess(data.message || `User ${selectedUser.username} updated!`);
      setShowEditModal(false);
      setSelectedUser(null);
      fetchUsers(true);
    } catch (err: any) {
      setError(err.message || 'Error updating user.');
    } finally {
      setIsEditing(false);
    }
  };

  // 3. Open Reset Password Modal
  const openResetModal = (user: UserItem) => {
    setSelectedUser(user);
    setResetNewPassword('');
    setResetConfirmPassword('');
    setShowResetModal(true);
    setError(null);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setError(null);

    if (resetNewPassword !== resetConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (resetNewPassword.trim().length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser._id,
          newPassword: resetNewPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password.');
      }

      setSuccess(data.message || `Password reset successfully for ${selectedUser.username}!`);
      setShowResetModal(false);
      setSelectedUser(null);
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Error resetting password.');
    } finally {
      setIsResetting(false);
    }
  };

  // 4. Handle Developer Self Password Reset
  const handleSelfReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selfNewPassword !== selfConfirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }
    if (selfNewPassword.trim().length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setIsSelfResetting(true);
    try {
      const res = await fetch('/api/admin/users/self-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: selfCurrentPassword,
          newPassword: selfNewPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset developer password.');
      }

      setSuccess(data.message || 'Developer password has been updated successfully!');
      setShowSelfResetModal(false);
      setSelfCurrentPassword('');
      setSelfNewPassword('');
      setSelfConfirmPassword('');
      fetchUsers(true);
    } catch (err: any) {
      setError(err.message || 'Error resetting developer password.');
    } finally {
      setIsSelfResetting(false);
    }
  };

  // 5. Open Delete Modal
  const openDeleteModal = (user: UserItem) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
    setError(null);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setError(null);
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/admin/users?id=${selectedUser._id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user.');
      }

      setSuccess(data.message || `User ${selectedUser.username} deleted.`);
      setShowDeleteModal(false);
      setSelectedUser(null);
      fetchUsers(true);
    } catch (err: any) {
      setError(err.message || 'Error deleting user.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert / Feedback */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-950/70 border border-red-800 text-red-300 text-sm flex items-start justify-between gap-3 animate-in fade-in">
          <div className="flex items-start space-x-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <span className="font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-sm flex items-start justify-between gap-3 animate-in fade-in">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <span className="font-medium">{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <span>User & Access Role Management</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
              {users.length} Users
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Create user accounts, reset credentials, assign portal access roles, and manage active logins.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowSelfResetModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 hover:border-cyan-500 text-slate-200 hover:text-white text-xs font-bold transition flex items-center gap-2 shadow-sm"
            title="Reset your own Developer Admin password"
          >
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Reset Self Password</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-cyan-950/40"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Create New User</span>
          </button>

          <button
            onClick={() => fetchUsers(true)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition disabled:opacity-50"
            title="Reload Users"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards: Roles Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Total Users</span>
          <span className="text-xl font-black font-mono text-white mt-1 block">{roleStats.total}</span>
          <span className="text-[10px] text-emerald-400">{roleStats.active} active accounts</span>
        </div>

        <div className="bg-slate-900/70 border border-cyan-800/40 rounded-2xl p-3.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 block flex items-center gap-1">
            <Terminal className="w-3 h-3" /> Developers
          </span>
          <span className="text-xl font-black font-mono text-cyan-300 mt-1 block">{roleStats.developer}</span>
          <span className="text-[10px] text-slate-400">Root console access</span>
        </div>

        <div className="bg-slate-900/70 border border-red-800/40 rounded-2xl p-3.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-red-400 block flex items-center gap-1">
            <Shield className="w-3 h-3" /> Super Admin
          </span>
          <span className="text-xl font-black font-mono text-red-400 mt-1 block">{roleStats.admin}</span>
          <span className="text-[10px] text-slate-400">Full cargo admin</span>
        </div>

        <div className="bg-slate-900/70 border border-amber-800/40 rounded-2xl p-3.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block flex items-center gap-1">
            <FileText className="w-3 h-3" /> Billers
          </span>
          <span className="text-xl font-black font-mono text-amber-400 mt-1 block">{roleStats.biller}</span>
          <span className="text-[10px] text-slate-400">Invoices & HSN</span>
        </div>

        <div className="bg-slate-900/70 border border-emerald-800/40 rounded-2xl p-3.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block flex items-center gap-1">
            <Truck className="w-3 h-3" /> Dispatchers
          </span>
          <span className="text-xl font-black font-mono text-emerald-400 mt-1 block">{roleStats.dispatcher}</span>
          <span className="text-[10px] text-slate-400">Delivery & dispatch</span>
        </div>

        <div className="bg-slate-900/70 border border-blue-800/40 rounded-2xl p-3.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 block flex items-center gap-1">
            <Users className="w-3 h-3" /> Employees
          </span>
          <span className="text-xl font-black font-mono text-blue-400 mt-1 block">{roleStats.staff}</span>
          <span className="text-[10px] text-slate-400">Read-only cargo</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username or display name..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500 text-xs"
          >
            <option value="all">All Roles</option>
            <option value="developer">Developer Admin</option>
            <option value="admin">Super Admin</option>
            <option value="biller">Biller</option>
            <option value="dispatcher">Dispatcher</option>
            <option value="staff">Staff / Employee</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500 text-xs"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Deactivated Only</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[11px]">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Login Status</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center space-x-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                      <span>Loading user accounts...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Users className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <span>No user accounts found matching current filters.</span>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-slate-850/60 transition group">
                    {/* User info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white uppercase text-xs">
                          {user.username.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-1.5">
                            <span>{user.name || user.username}</span>
                            {user.role === 'developer' && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                                ROOT
                              </span>
                            )}
                          </div>
                          <span className="text-slate-400 font-mono text-[11px]">@{user.username}</span>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3 px-4">{getRoleBadge(user.role)}</td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <Check className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-700">
                          <UserX className="w-3 h-3 text-red-400" />
                          Disabled
                        </span>
                      )}
                    </td>

                    {/* Last Login */}
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {user.lastLoginAt ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {new Date(user.lastLoginAt).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-600">Never logged in</span>
                      )}
                    </td>

                    {/* Created At */}
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center space-x-1.5">
                        {/* Assign Role / Edit */}
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500 hover:text-cyan-400 text-slate-300 transition"
                          title="Assign Role & Edit Profile"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Reset Password */}
                        <button
                          onClick={() => openResetModal(user)}
                          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500 hover:text-amber-400 text-slate-300 transition"
                          title="Reset User Password"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete User */}
                        <button
                          onClick={() => openDeleteModal(user)}
                          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-red-500 hover:text-red-400 text-slate-300 transition"
                          title="Delete User"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Create New User */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Create New Login User</h3>
                  <p className="text-xs text-slate-400">Provide user credentials and assign system portal role</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {/* Username */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                  Username <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value.toLowerCase().trim())}
                  placeholder="e.g. rahul_biller, dispatch_team, super_admin"
                  required
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Used to login. Lowercase letters, numbers, underscores or hyphens only.
                </p>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                  Display / Full Name
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-300">
                    Initial Password <span className="text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => generatePassword('create')}
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] font-mono flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Generate Strong</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="Enter initial password (min. 4 characters)..."
                    required
                    minLength={4}
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                  >
                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-2">
                  Assign Portal Role <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      role: 'developer' as UserRole,
                      title: 'Developer Admin',
                      desc: 'Visitor Logs, Hardware Telemetry & User Manager',
                      color: 'border-cyan-800/80 bg-cyan-950/20 text-cyan-300',
                      icon: <Terminal className="w-4 h-4 text-cyan-400" />,
                    },
                    {
                      role: 'admin' as UserRole,
                      title: 'Super Admin',
                      desc: 'Full Read, Write, Edit, Upload & Sync',
                      color: 'border-red-800/80 bg-red-950/20 text-red-300',
                      icon: <Shield className="w-4 h-4 text-red-400" />,
                    },
                    {
                      role: 'biller' as UserRole,
                      title: 'Biller (बिलर)',
                      desc: 'HSN, IGST, Pcs, KG & Bill generation',
                      color: 'border-amber-800/80 bg-amber-950/20 text-amber-300',
                      icon: <FileText className="w-4 h-4 text-amber-400" />,
                    },
                    {
                      role: 'dispatcher' as UserRole,
                      title: 'Dispatcher (डिस्पैचर)',
                      desc: 'Vehicle No & Mark Goods Dispatched',
                      color: 'border-emerald-800/80 bg-emerald-950/20 text-emerald-300',
                      icon: <Truck className="w-4 h-4 text-emerald-400" />,
                    },
                    {
                      role: 'staff' as UserRole,
                      title: 'Staff / Employee',
                      desc: 'Read-only Cargo Master Table & search',
                      color: 'border-blue-800/80 bg-blue-950/20 text-blue-300',
                      icon: <Users className="w-4 h-4 text-blue-400" />,
                    },
                  ].map((r) => {
                    const isSelected = createRole === r.role;
                    return (
                      <div
                        key={r.role}
                        onClick={() => setCreateRole(r.role)}
                        className={`p-3 rounded-xl border cursor-pointer transition ${
                          isSelected
                            ? `${r.color} ring-2 ring-cyan-500`
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-1">
                          {r.icon}
                          <span className="font-bold text-xs text-white">{r.title}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">{r.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition flex items-center space-x-2 disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Create User</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Assign Role & Edit User */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Assign Role & Edit Profile</h3>
                  <p className="text-xs text-slate-400">Managing user @{selectedUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditUser} className="p-6 space-y-4">
              {/* Username (read-only) */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Username (Fixed ID)
                </label>
                <input
                  type="text"
                  value={selectedUser.username}
                  disabled
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-400 font-mono text-sm cursor-not-allowed"
                />
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                  Display / Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Assign Role */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-2">
                  Change / Assign Portal Role
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { role: 'developer' as UserRole, title: 'Developer Admin', icon: <Terminal className="w-4 h-4 text-cyan-400" /> },
                    { role: 'admin' as UserRole, title: 'Super Admin', icon: <Shield className="w-4 h-4 text-red-400" /> },
                    { role: 'biller' as UserRole, title: 'Biller (बिलर)', icon: <FileText className="w-4 h-4 text-amber-400" /> },
                    { role: 'dispatcher' as UserRole, title: 'Dispatcher (डिस्पैचर)', icon: <Truck className="w-4 h-4 text-emerald-400" /> },
                    { role: 'staff' as UserRole, title: 'Staff / Employee', icon: <Users className="w-4 h-4 text-blue-400" /> },
                  ].map((r) => {
                    const isSelected = editRole === r.role;
                    return (
                      <div
                        key={r.role}
                        onClick={() => setEditRole(r.role)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center space-x-2.5 ${
                          isSelected
                            ? 'bg-cyan-950/30 border-cyan-500 text-white ring-1 ring-cyan-500'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                        }`}
                      >
                        {r.icon}
                        <span className="font-bold text-xs">{r.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Login Status Active / Inactive */}
              <div className="pt-2">
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-2">
                  Account Login Status
                </label>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditIsActive(true)}
                    className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                      editIsActive
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Active (Allowed)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditIsActive(false)}
                    className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                      !editIsActive
                        ? 'bg-red-950/60 border-red-500 text-red-300 ring-1 ring-red-500'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Deactivated (Blocked)</span>
                  </button>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center space-x-2 disabled:opacity-50"
                >
                  {isEditing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset User Password */}
      {showResetModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Reset User Password</h3>
                  <p className="text-xs text-slate-400">Set new password for @{selectedUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                <span>Account Role:</span>
                <span className="font-bold text-white uppercase">{selectedUser.role}</span>
              </div>

              {/* New Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-mono uppercase tracking-wider text-slate-300">
                    New Password <span className="text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => generatePassword('reset')}
                    className="text-amber-400 hover:text-amber-300 text-[11px] font-mono flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Generate Strong</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showResetNewPassword ? 'text' : 'password'}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 4 characters)..."
                    required
                    minLength={4}
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetNewPassword(!showResetNewPassword)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                  >
                    {showResetNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                  Confirm New Password <span className="text-red-400">*</span>
                </label>
                <input
                  type={showResetNewPassword ? 'text' : 'password'}
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Repeat new password..."
                  required
                  minLength={4}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center space-x-2 disabled:opacity-50"
                >
                  {isResetting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Resetting...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4" />
                      <span>Apply New Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Developer Reset Self Password */}
      {showSelfResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-xl">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Reset Developer Password</h3>
                  <p className="text-xs text-slate-400">Change your root Developer Admin credentials</p>
                </div>
              </div>
              <button
                onClick={() => setShowSelfResetModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSelfReset} className="p-6 space-y-4">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                  Current Developer Password / Passkey
                </label>
                <div className="relative">
                  <input
                    type={showSelfCurrent ? 'text' : 'password'}
                    value={selfCurrentPassword}
                    onChange={(e) => setSelfCurrentPassword(e.target.value)}
                    placeholder="Enter current developer passkey..."
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSelfCurrent(!showSelfCurrent)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                  >
                    {showSelfCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                  New Developer Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showSelfNew ? 'text' : 'password'}
                    value={selfNewPassword}
                    onChange={(e) => setSelfNewPassword(e.target.value)}
                    placeholder="Enter new developer password (min. 4 chars)..."
                    required
                    minLength={4}
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSelfNew(!showSelfNew)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                  >
                    {showSelfNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                  Confirm New Password <span className="text-red-400">*</span>
                </label>
                <input
                  type={showSelfNew ? 'text' : 'password'}
                  value={selfConfirmPassword}
                  onChange={(e) => setSelfConfirmPassword(e.target.value)}
                  placeholder="Repeat new password..."
                  required
                  minLength={4}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowSelfResetModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSelfResetting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition flex items-center space-x-2 disabled:opacity-50"
                >
                  {isSelfResetting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Delete Confirmation Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-red-900/60 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-5 bg-red-950/40 border-b border-red-900/50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 text-red-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-white text-base">Delete User Account</h3>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                Are you sure you want to permanently delete the user account{' '}
                <strong className="text-white font-mono">@{selectedUser.username}</strong> ({selectedUser.role})?
              </p>
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300 font-medium">
                Warning: Once deleted, this user will no longer be able to log in to the system.
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={isDeleting}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center space-x-2 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Permanently Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
