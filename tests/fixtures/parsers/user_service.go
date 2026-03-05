package service

import (
    "context"
    "errors"
)

type UserService struct {
    repo UserRepository
}

func NewUserService(repo UserRepository) *UserService {
    return &UserService{repo: repo}
}

func (s *UserService) GetUser(ctx context.Context, id int64) (*User, error) {
    if id <= 0 {
        return nil, errors.New("invalid id")
    }
    return s.repo.FindByID(ctx, id)
}
