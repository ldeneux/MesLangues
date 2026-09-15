'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { listProfiles, createProfile, type Profile } from '../../lib/profiles';

const STORAGE_KEY = 'frasi_profile_id';

const EMOJI_CHOICES = ['🙂', '😄', '🦊', '🐱', '🐼', '🌸', '⭐', '🚀', '🎨', '📚'];

type ProfileContextValue = {
  profiles: Profile[];
  profile: Profile | null;
  loading: boolean;
  selectProfile: (id: string) => void;
  addProfile: (name: string, emoji: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile doit être utilisé dans <ProfileProvider>');
  return ctx;
}

export { EMOJI_CHOICES };

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProfiles().then((list) => {
      setProfiles(list);
      const storedId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const found = list.find((p) => p.id === storedId);
      if (found) setProfile(found);
      setLoading(false);
    });
  }, []);

  function selectProfile(id: string) {
    const found = profiles.find((p) => p.id === id);
    if (!found) return;
    setProfile(found);
    localStorage.setItem(STORAGE_KEY, id);
  }

  async function addProfile(name: string, emoji: string) {
    const created = await createProfile(name, emoji);
    setProfiles((prev) => [...prev, created]);
    setProfile(created);
    localStorage.setItem(STORAGE_KEY, created.id);
  }

  return (
    <ProfileContext.Provider value={{ profiles, profile, loading, selectProfile, addProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}
