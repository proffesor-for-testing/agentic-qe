export function greet(name) {
  return `Hello, ${name}!`;
}

export class UserService {
  constructor() {
    this.users = new Map();
  }

  async getUser(id) {
    return this.users.get(id) || null;
  }

  createUser(name, email) {
    const user = { id: crypto.randomUUID(), name, email };
    this.users.set(user.id, user);
    return user;
  }
}
