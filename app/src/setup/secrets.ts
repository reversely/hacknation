import * as SecureStore from 'expo-secure-store';

// Credentials live in the iOS Keychain or Android Keystore. Only connectors read them; the
// model sees step statuses from setupSummary(), never these values.
export type SecretName = 'device_token' | 'vercel_token' | 'vercel_project_id'; // pragma: allowlist secret (names, not values)

export type SecretVault = {
  get(name: SecretName): Promise<string | null>;
  set(name: SecretName, value: string): Promise<void>;
  remove(name: SecretName): Promise<void>;
};

export const secureVault: SecretVault = {
  get: (name) => SecureStore.getItemAsync(name),
  set: (name, value) => SecureStore.setItemAsync(name, value),
  remove: (name) => SecureStore.deleteItemAsync(name),
};
