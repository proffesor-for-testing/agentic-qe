using System.Threading.Tasks;

namespace MyApp.Services
{
    public class UserService
    {
        private readonly IUserRepository _repository;

        public UserService(IUserRepository repository)
        {
            _repository = repository;
        }

        public async Task<User?> GetUserAsync(int id)
        {
            return await _repository.FindByIdAsync(id);
        }

        public List<User> GetAllUsers()
        {
            return _repository.FindAll();
        }
    }
}
