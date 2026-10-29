"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Business } from "./api/types";
import { apiRequest } from "./api/client";

interface AuthContextType {
  user: User | null;
  businesses: Business[];
  activeBusiness: Business | null;
  loading: boolean;
  setActiveBusiness: (b: Business) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBusinesses = useCallback(async () => {
    try {
      const res = await apiRequest<{ businesses: Business[] }>("/businesses");
      setBusinesses(res.businesses);
      if (res.businesses.length > 0) {
        // Keep active business if still in list, else default to first
        setActiveBusiness((prev) => {
          if (prev && res.businesses.some((b) => b.id === prev.id)) return prev;
          return res.businesses[0] ?? null;
        });
      } else {
        setActiveBusiness(null);
      }
    } catch {
      setBusinesses([]);
      setActiveBusiness(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest<{ user: User }>("/api/auth/me");
      setUser(res.user);
      await fetchBusinesses();
    } catch {
      setUser(null);
      setBusinesses([]);
      setActiveBusiness(null);
    } finally {
      setLoading(false);
    }
  }, [fetchBusinesses]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(res.user);
    await fetchBusinesses();
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await apiRequest<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: { email, password, name },
    });
    setUser(res.user);
    await fetchBusinesses();
  };

  const logout = async () => {
    try {
      await apiRequest<{ success: boolean }>("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      setUser(null);
      setBusinesses([]);
      setActiveBusiness(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        businesses,
        activeBusiness,
        loading,
        setActiveBusiness,
        login,
        register,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
