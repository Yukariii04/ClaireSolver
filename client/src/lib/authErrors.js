const AUTH_ERROR_MESSAGES = {
  'auth/email-already-in-use': 'An account already exists for this email. Try signing in instead.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your connection and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before completing sign-in.',
  'auth/too-many-requests': 'There have been too many attempts. Wait a little and try again.',
  'auth/weak-password': 'Choose a password with at least 6 characters.',
};

export function authErrorMessage(error) {
  return AUTH_ERROR_MESSAGES[error?.code] || 'Sign-in failed. Please try again.';
}

