
describe('UserService', () => {
  it('should create user', async () => {
    const user = await userService.create({ name: 'Test' });
    expect(user.id).toBeDefined();
  });
});
      