package main

func Greet(name string) string {
    return "Hello, " + name + "!"
}

type UserService struct {
    users map[string]User
}

func (s *UserService) GetUser(id string) (*User, error) {
    user, ok := s.users[id]
    if !ok {
        return nil, nil
    }
    return &user, nil
}
