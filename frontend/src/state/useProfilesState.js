import { useState, useEffect, useMemo, useRef } from 'react';

// Owns the multi-profile domain state: the profile list + active id, the
// picker/manage/dropdown open flags, the profile edit-form fields, and the PIN
// entry fields. Also owns the dropdown ref + the outside-click effect that
// closes the profile dropdown, and derives the active profile object + kids flag.
//
// NOTE: profile *lifecycle* logic (migration/init effect, profile switching,
// per-profile data loading) stays in App for now because it orchestrates other
// domains (library, continue-watching, playlists, theme, cloud sync) whose
// setters are not available here yet. It folds in once those live in the provider.
export function useProfilesState() {
  const [profiles, setProfiles] = useState(() => {
    const saved = localStorage.getItem('premium_search_profiles');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeProfileId, setActiveProfileId] = useState(() => {
    return localStorage.getItem('premium_search_active_profile_id') || '';
  });
  const [isProfilePickerOpen, setIsProfilePickerOpen] = useState(false);
  const [isManagingProfiles, setIsManagingProfiles] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  // Profile Edit Form States
  const [editingProfile, setEditingProfile] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('🦁');
  const [editColor, setEditColor] = useState('avatar-grad-purple-pink');
  const [editIsKids, setEditIsKids] = useState(false);
  const [editAllowedTrackers, setEditAllowedTrackers] = useState([]);
  const [customTrackerInput, setCustomTrackerInput] = useState('');
  const [editMaxMovieRating, setEditMaxMovieRating] = useState('PG-13');
  const [editMaxTvRating, setEditMaxTvRating] = useState('TV-14');
  const [editBlockUnrated, setEditBlockUnrated] = useState(false);
  const [pinTargetProfile, setPinTargetProfile] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [editPin, setEditPin] = useState('');
  const [editEnablePin, setEditEnablePin] = useState(false);
  const [pinTargetAction, setPinTargetAction] = useState('switch');

  const profileDropdownRef = useRef(null);

  const activeProfile = useMemo(() => {
    return profiles.find(p => p.id === activeProfileId) || null;
  }, [profiles, activeProfileId]);

  const isKids = activeProfile ? activeProfile.isKids : false;

  // Close the profile dropdown when clicking outside it.
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (isProfileDropdownOpen && profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isProfileDropdownOpen]);

  return {
    profiles, setProfiles,
    activeProfileId, setActiveProfileId,
    isProfilePickerOpen, setIsProfilePickerOpen,
    isManagingProfiles, setIsManagingProfiles,
    isProfileDropdownOpen, setIsProfileDropdownOpen,
    editingProfile, setEditingProfile,
    editName, setEditName,
    editAvatar, setEditAvatar,
    editColor, setEditColor,
    editIsKids, setEditIsKids,
    editAllowedTrackers, setEditAllowedTrackers,
    customTrackerInput, setCustomTrackerInput,
    editMaxMovieRating, setEditMaxMovieRating,
    editMaxTvRating, setEditMaxTvRating,
    editBlockUnrated, setEditBlockUnrated,
    pinTargetProfile, setPinTargetProfile,
    pinInput, setPinInput,
    pinError, setPinError,
    editPin, setEditPin,
    editEnablePin, setEditEnablePin,
    pinTargetAction, setPinTargetAction,
    profileDropdownRef,
    activeProfile,
    isKids,
  };
}
