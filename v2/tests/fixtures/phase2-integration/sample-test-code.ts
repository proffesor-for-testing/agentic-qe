/**
 * Sample Test Code for Pattern Extraction Tests
 */

describe('UserService', () => {
  let service: UserService;
  let database: Database;

  beforeEach(() => {
    database = new TestDatabase();
    service = new UserService(database);
  });

  afterEach(async () => {
    await database.cleanup();
  });

  describe('User Creation', () => {
    it('should create user with valid data', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      };

      const user = await service.createUser(userData);

      expect(user.id).toBeDefined();
      expect(user.name).toBe(userData.name);
      expect(user.email).toBe(userData.email);
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('should throw on duplicate email', async () => {
      const userData = { name: 'John', email: 'duplicate@example.com', age: 25 };

      await service.createUser(userData);

      await expect(service.createUser(userData))
        .rejects.toThrow('Email already exists');
    });

    it('should validate email format', async () => {
      const invalidEmail = { name: 'John', email: 'invalid-email', age: 25 };

      await expect(service.createUser(invalidEmail))
        .rejects.toThrow('Invalid email format');
    });

    it('should sanitize user input', async () => {
      const maliciousInput = {
        name: '<script>alert("XSS")</script>',
        email: 'safe@example.com',
        age: 25
      };

      const user = await service.createUser(maliciousInput);

      expect(user.name).not.toContain('<script>');
    });
  });

  describe('User Retrieval', () => {
    it('should retrieve user by ID', async () => {
      const created = await service.createUser({
        name: 'Jane',
        email: 'jane@example.com',
        age: 28
      });

      const retrieved = await service.getUserById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.email).toBe(created.email);
    });

    it('should return null for non-existent user', async () => {
      const result = await service.getUserById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should retrieve users by email', async () => {
      const email = 'test@example.com';
      await service.createUser({ name: 'Test', email, age: 30 });

      const users = await service.getUsersByEmail(email);

      expect(users).toHaveLength(1);
      expect(users[0].email).toBe(email);
    });
  });

  describe('User Update', () => {
    it('should update user data', async () => {
      const user = await service.createUser({
        name: 'Original',
        email: 'update@example.com',
        age: 25
      });

      const updated = await service.updateUser(user.id, {
        name: 'Updated'
      });

      expect(updated.name).toBe('Updated');
      expect(updated.email).toBe(user.email); // Unchanged
    });

    it('should not update with invalid data', async () => {
      const user = await service.createUser({
        name: 'User',
        email: 'valid@example.com',
        age: 30
      });

      await expect(service.updateUser(user.id, { email: 'invalid' }))
        .rejects.toThrow('Invalid email format');
    });
  });

  describe('User Deletion', () => {
    it('should delete user by ID', async () => {
      const user = await service.createUser({
        name: 'Delete Me',
        email: 'delete@example.com',
        age: 30
      });

      const deleted = await service.deleteUser(user.id);

      expect(deleted).toBe(true);

      const retrieved = await service.getUserById(user.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent user deletion', async () => {
      const result = await service.deleteUser('non-existent');

      expect(result).toBe(false);
    });
  });
});
