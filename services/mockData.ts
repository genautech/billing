import type { TabelaPrecoItem } from '../types';

// Mock data is no longer used for price concepts.
// The data is now managed via CSV upload into Firestore's 'tabelaPrecos' collection.
// This ensures consistency between development and production environments.
export const tabelaPrecosMock: TabelaPrecoItem[] = [];
