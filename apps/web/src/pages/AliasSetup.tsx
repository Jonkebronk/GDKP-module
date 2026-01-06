import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Swords, User, AlertCircle, Check } from 'lucide-react';

const ALIAS_REGEX = /^[a-zA-Z0-9_-]+$/;

export function AliasSetupPage() {
  const navigate = useNavigate();
  const { user, updateAlias } = useAuthStore();
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateAlias = (value: string): string | null => {
    if (value.length < 2) {
      return 'Alias must be at least 2 characters';
    }
    if (value.length > 32) {
      return 'Alias must be at most 32 characters';
    }
    if (!ALIAS_REGEX.test(value)) {
      return 'Alias can only contain letters, numbers, underscores, and hyphens';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateAlias(alias);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await updateAlias(alias);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set alias');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = alias.length >= 2 && alias.length <= 32 && ALIAS_REGEX.test(alias);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        <div className="text-center">
          <Swords className="mx-auto h-16 w-16 text-gold-500" />
          <h1 className="mt-6 text-3xl font-bold text-white">Choose Your Alias</h1>
          <p className="mt-2 text-gray-400">
            This name will be displayed to other users
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <User className="h-5 w-5 text-gold-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-300">
              <p>
                Your Discord identity (<span className="text-gold-400">{user?.discord_username}</span>) will remain private.
                Only administrators can see your real Discord name.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="alias" className="block text-sm font-medium text-gray-300 mb-2">
              Display Name
            </label>
            <div className="relative">
              <input
                id="alias"
                type="text"
                value={alias}
                onChange={(e) => {
                  setAlias(e.target.value);
                  setError('');
                }}
                placeholder="Enter your alias..."
                className={`
                  w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500
                  focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent
                  ${error ? 'border-red-500' : 'border-gray-700'}
                `}
                maxLength={32}
                autoFocus
              />
              {isValid && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
              )}
            </div>

            {/* Character count */}
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>2-32 characters, letters, numbers, _ -</span>
              <span className={alias.length > 32 ? 'text-red-500' : ''}>
                {alias.length}/32
              </span>
            </div>

            {/* Error message */}
            {error && (
              <div className="mt-2 flex items-center space-x-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className={`
              w-full py-3 px-4 rounded-lg font-medium transition-colors
              ${isValid && !isSubmitting
                ? 'bg-gold-500 hover:bg-gold-600 text-gray-900'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-900 mr-2"></div>
                Setting up...
              </span>
            ) : (
              'Continue'
            )}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm">
          You can change your alias anytime from your profile settings
        </p>
      </div>
    </div>
  );
}
