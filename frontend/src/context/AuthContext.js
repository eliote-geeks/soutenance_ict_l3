import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext();

const STORAGE_KEYS = {
  users: 'elasticguard-users',
  session: 'elasticguard-session',
};

const DEFAULT_USERS = [
  {
    id: 'user_admin',
    name: 'Admin P37',
    email: 'admin@uy1.local',
    role: 'admin',
    status: 'active',
    department: 'Network',
    title: 'Security Lead',
    phone: '+237 600 000 001',
    createdAt: '2025-01-01T09:00:00.000Z',
    lastLogin: null,
    password: 'admin123',
  },
  {
    id: 'user_analyst',
    name: 'Analyst One',
    email: 'analyst@uy1.local',
    role: 'analyst',
    status: 'active',
    department: 'Network',
    title: 'SOC Analyst',
    phone: '+237 600 000 002',
    createdAt: '2025-01-05T10:30:00.000Z',
    lastLogin: null,
    password: 'analyst123',
  },
  {
    id: 'user_viewer',
    name: 'Viewer One',
    email: 'viewer@uy1.local',
    role: 'viewer',
    status: 'suspended',
    department: 'Network',
    title: 'Risk Observer',
    phone: '+237 600 000 003',
    createdAt: '2025-01-07T08:15:00.000Z',
    lastLogin: null,
    password: 'viewer123',
  },
];

const safeParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const readStorage = (key, fallback) => {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  return safeParse(raw, fallback);
};

const normalizeEmail = (email) => email.trim().toLowerCase();

const generateId = () => `user_${Math.random().toString(36).slice(2, 10)}`;

const generateTempPassword = () => `Temp-${Math.random().toString(36).slice(2, 8)}!`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [users, setUsers] = useState(() => readStorage(STORAGE_KEYS.users, DEFAULT_USERS));
  const [session, setSession] = useState(() => readStorage(STORAGE_KEYS.session, null));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (session) {
      window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.session);
    }
  }, [session]);

  const user = useMemo(() => {
    if (!session?.userId) {
      return null;
    }
    return users.find((item) => item.id === session.userId) || null;
  }, [session, users]);

  const isAuthenticated = Boolean(user);

  const login = async ({ email, password }) => {
    await delay(250);
    const normalizedEmail = normalizeEmail(email);
    const matchedUser = users.find((item) => normalizeEmail(item.email) === normalizedEmail);
    if (!matchedUser || matchedUser.password !== password) {
      throw new Error('Invalid email or password.');
    }
    if (matchedUser.status === 'suspended') {
      throw new Error('Account suspended. Contact an administrator.');
    }
    const lastLogin = new Date().toISOString();
    setUsers((prev) => prev.map((item) => item.id === matchedUser.id
      ? { ...item, lastLogin }
      : item));
    setSession({ userId: matchedUser.id });
    return { ...matchedUser, lastLogin };
  };

  const logout = () => {
    setSession(null);
  };

  const register = async ({ name, email, password }) => {
    await delay(300);
    const normalizedEmail = normalizeEmail(email);
    if (users.some((item) => normalizeEmail(item.email) === normalizedEmail)) {
      throw new Error('Email already exists.');
    }
    const createdAt = new Date().toISOString();
    const newUser = {
      id: generateId(),
      name: name || 'New User',
      email: normalizedEmail,
      role: 'analyst',
      status: 'active',
      department: 'Network',
      title: 'SOC Analyst',
      phone: '',
      createdAt,
      lastLogin: null,
      password,
    };
    setUsers((prev) => [...prev, newUser]);
    setSession({ userId: newUser.id });
    return newUser;
  };

  const resetPassword = async ({ email }) => {
    await delay(300);
    const normalizedEmail = normalizeEmail(email);
    const matchedUser = users.find((item) => normalizeEmail(item.email) === normalizedEmail);
    if (!matchedUser) {
      throw new Error('No account found for this email.');
    }
    const tempPassword = generateTempPassword();
    setUsers((prev) => prev.map((item) => item.id === matchedUser.id
      ? { ...item, password: tempPassword }
      : item));
    return { tempPassword };
  };

  const updateProfile = async (updates) => {
    if (!user) {
      throw new Error('No active session.');
    }
    let nextUpdates = { ...updates };
    if (updates.email) {
      const normalizedEmail = normalizeEmail(updates.email);
      if (users.some((item) => item.id !== user.id && normalizeEmail(item.email) === normalizedEmail)) {
        throw new Error('Email already in use.');
      }
      nextUpdates.email = normalizedEmail;
    }
    setUsers((prev) => prev.map((item) => item.id === user.id
      ? { ...item, ...nextUpdates }
      : item));
    return { ...user, ...nextUpdates };
  };

  const updatePassword = async ({ currentPassword, nextPassword }) => {
    if (!user) {
      throw new Error('No active session.');
    }
    const matchedUser = users.find((item) => item.id === user.id);
    if (!matchedUser || matchedUser.password !== currentPassword) {
      throw new Error('Current password is incorrect.');
    }
    setUsers((prev) => prev.map((item) => item.id === user.id
      ? { ...item, password: nextPassword }
      : item));
    return true;
  };

  const addUser = async (data) => {
    await delay(200);
    const normalizedEmail = normalizeEmail(data.email || '');
    if (!data.name || !data.email) {
      throw new Error('Name and email are required.');
    }
    if (users.some((item) => normalizeEmail(item.email) === normalizedEmail)) {
      throw new Error('Email already exists.');
    }
    const createdAt = new Date().toISOString();
    const tempPassword = data.password || generateTempPassword();
    const newUser = {
      id: generateId(),
      name: data.name,
      email: normalizedEmail,
      role: data.role || 'analyst',
      status: data.status || 'active',
      department: data.department || 'Network',
      title: data.title || 'SOC Analyst',
      phone: data.phone || '',
      createdAt,
      lastLogin: null,
      password: tempPassword,
    };
    setUsers((prev) => [...prev, newUser]);
    return { user: newUser, tempPassword };
  };

  const updateUser = async (userId, updates) => {
    await delay(150);
    setUsers((prev) => prev.map((item) => item.id === userId
      ? { ...item, ...updates }
      : item));
  };

  const removeUser = async (userId) => {
    await delay(150);
    setUsers((prev) => prev.filter((item) => item.id !== userId));
    if (session?.userId === userId) {
      setSession(null);
    }
  };

  const toggleUserStatus = async (userId) => {
    await delay(150);
    setUsers((prev) => prev.map((item) => {
      if (item.id !== userId) {
        return item;
      }
      return {
        ...item,
        status: item.status === 'active' ? 'suspended' : 'active',
      };
    }));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        isAuthenticated,
        login,
        logout,
        register,
        resetPassword,
        updateProfile,
        updatePassword,
        addUser,
        updateUser,
        removeUser,
        toggleUserStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
