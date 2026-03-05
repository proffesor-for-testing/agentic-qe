use std::sync::Arc;

pub struct UserService {
    repo: Arc<dyn UserRepository>,
}

impl UserService {
    pub fn new(repo: Arc<dyn UserRepository>) -> Self {
        Self { repo }
    }

    pub async fn get_user(&self, id: i64) -> Result<User, Error> {
        self.repo.find_by_id(id).await
    }

    fn internal_helper(&self) -> bool {
        true
    }
}
