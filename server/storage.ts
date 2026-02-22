export interface IStorage {
  // In-memory storage or no storage needed if client-side only
}

export class MemStorage implements IStorage {
}

export const storage = new MemStorage();