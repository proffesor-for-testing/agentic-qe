pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

pub struct UserService {
    users: HashMap<String, User>,
}

impl UserService {
    pub fn new() -> Self {
        Self { users: HashMap::new() }
    }

    pub async fn get_user(&self, id: &str) -> Option<&User> {
        self.users.get(id)
    }
}
