export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export class UserService {
  private users: Map<string, User> = new Map();

  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  public createUser(name: string, email: string): User {
    const user = { id: crypto.randomUUID(), name, email };
    this.users.set(user.id, user);
    return user;
  }
}

interface User {
  id: string;
  name: string;
  email: string;
}
