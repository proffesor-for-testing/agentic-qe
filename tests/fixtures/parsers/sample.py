import os
from typing import List, Optional

class UserService:
    def __init__(self, db: Database):
        self.db = db

    def get_user(self, user_id: int) -> Optional[User]:
        return self.db.find(user_id)

    async def create_user(self, name: str, email: str) -> User:
        return await self.db.create(name=name, email=email)

def helper_function(items: List[str]) -> int:
    return len(items)
