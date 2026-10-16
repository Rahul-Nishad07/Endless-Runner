

import { useCallback, useEffect, useState } from 'react';
import {
  GoogleSignin,
  statusCodes,
  type User,
} from '@react-native-google-signin/google-signin';

// Replace this with your Google Cloud WEB Client ID.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_WEB_CLIENT_ID;

// Configure Google Sign-In once.
GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
});

type GoogleAuthError = {
  code?: string;
  message?: string;
};

const getErrorCode = (error: unknown): string | undefined => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return undefined;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
};

export const useGoogleAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check the currently signed-in user.
  const checkCurrentUser = useCallback(async () => {
    try {
      const currentUser = await GoogleSignin.getCurrentUser();
      setUser(currentUser);
    } catch (err: unknown) {
      console.error('Check current user error:', err);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void checkCurrentUser();
  }, [checkCurrentUser]);

  // Sign in with Google.
  const signIn = useCallback(async (): Promise<User | null> => {
    setLoading(true);
    setError(null);

    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      const response = await GoogleSignin.signIn();

      if (response.type !== 'success') {
        return null;
      }

      // response.data is the full User (profile lives under `.user`).
      const signedInUser = response.data;

      // Store the signed-in user in React state.
      setUser(signedInUser);

      // Optional: retrieve tokens if your backend needs them.
      // const tokens = await GoogleSignin.getTokens();

      return signedInUser;
    } catch (err: unknown) {
      const code = getErrorCode(err);

      if (code === statusCodes.SIGN_IN_CANCELLED) {
        return null;
      }

      if (code === statusCodes.IN_PROGRESS) {
        setError('Google Sign-In is already in progress.');
      } else if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services is unavailable or needs updating.');
      } else {
        setError(getErrorMessage(err));
      }

      console.error('Google Sign-In error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Sign out from Google.
  const signOut = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      await GoogleSignin.signOut();
      setUser(null);
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      console.error('Google Sign-Out error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Revoke Google access when the user explicitly requests it.
  const revokeAccess = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      await GoogleSignin.revokeAccess();
      setUser(null);
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      console.error('Google revoke access error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    user,
    loading,
    error,
    signIn,
    signOut,
    revokeAccess,
    checkCurrentUser,
  };
};

export default useGoogleAuth;