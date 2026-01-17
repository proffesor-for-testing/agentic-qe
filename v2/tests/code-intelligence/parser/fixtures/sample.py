def greet(name: str) -> str:
    """Greet a user by name."""
    return f"Hello, {name}!"

class UserService:
    def __init__(self):
        self._users = {}

    async def get_user(self, user_id: str):
        return self._users.get(user_id)

    @property
    def user_count(self) -> int:
        return len(self._users)
